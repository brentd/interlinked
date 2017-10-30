import rx from 'rxjs'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

let cid = 0
const nextClientId = () => cid++

const remoteToLocal = channel => remote => {
  return Object.entries(remote).reduce((local, [k, v]) => {
    if (v.type === 'observable') {
      const proxy = rx.Observable.create(observer => {
        const id = nextClientId()
        const complete = channel.completes.filter(x => x === id)
        const sub = channel.demux(id).takeUntil(complete).subscribe(observer)
        channel.main.send({subscribe: id, key: k})
        return () => {
          sub.unsubscribe()
          channel.main.send({unsubscribe: id})
        }
      })
      local[k] = proxy.takeUntil(channel.registers)
    } else if (v.type === 'function') {
      local[k] = (...params) => {
        const id = nextClientId()
        channel.main.send({method: k, params, id})
        return channel.results
          .filter(x => x.id === id)
          .map(x => {
            if (x.observable) {
              const proxy = rx.Observable.create(observer => {
                const complete = channel.completes.filter(x => x === id)
                const sub = channel.demux(id).takeUntil(complete).subscribe(observer)
                channel.main.send({subscribe: id})
                return () => {
                  sub.unsubscribe()
                  channel.main.send({unsubscribe: id})
                }
              })
              return proxy.takeUntil(channel.registers)
            } else {
              return x.result
            }
          })
          .take(1)
          .toPromise()
      }
    } else {
      local[k] = remoteToLocal(channel)(v)
    }
    return local
  }, {})
}

const localToRemote = local => {
  return Object.entries(local).reduce((remote, [k, v]) => {
    if (v.subscribe) {
      remote[k] = {key: k, type: 'observable'}
    } else if (typeof v === 'function') {
      remote[k] = {key: k, type: 'function'}
    } else if (typeof v === 'object' && v !== null) {
      remote[k] = transform(v)
    }
    return remote
  }, {})
}

// Represents the multiplexed pipe for a peer. Exists only to organize - it does
// not subscribe to any streams itself.
class Channel {
  constructor(input, sender) {
    this.input = input
    this.send  = (id, x) => sender([id, x])

    this.main = {
      in: this.demux('@').share(),
      send: x => this.send('@', x)
    }

    this.registers = this.main.in
      .filter(x => x.register != undefined)
      .pluck('register')

    this.subscribes = this.main.in
      .filter(x => x.subscribe != undefined)

    this.unsubscribes = this.main.in
      .filter(x => x.unsubscribe != undefined)
      .map(({unsubscribe: id}) => id)

    this.completes = this.main.in
      .filter(x => x.complete != undefined)
      .pluck('complete')

    this.methods = this.main.in
      .filter(x => x.method != undefined)

    this.results = this.main.in
      .filter(x => x.result != undefined)

    this.errors = this.main.in
      .filter(x => x.error != undefined)
  }

  demux(id) {
    return this.input.filter(x => x[0] === id).map(x => x[1])
  }
}

export default function(input, output, api) {
  const channel = new Channel(input, x => output.next(x))
  const observables = new Map()

  if (api && Object.keys(api).length > 0)
    channel.main.send({register: localToRemote(api)})

  channel.subscribes
    .filter(x => x.key !== undefined)
    .map(({subscribe: id, key}) =>
      api[key]
        .takeUntil(channel.unsubscribes.filter(x => x === id))
        .subscribe(
          x   => channel.send(id, x),
          err => channel.main.send({error: id}),
          ()  => channel.main.send({complete: id})
        )
    ).subscribe()

  channel.subscribes
    .filter(x => x.key === undefined)
    .map(({subscribe: id}) =>
      observables.get(id)
        .takeUntil(channel.unsubscribes.filter(x => x === id))
        .subscribe(
          x   => channel.send(id, x),
          err => channel.main.send({error: id}),
          ()  => channel.main.send({complete: id})
        )
    ).subscribe()

  channel.methods
    .map(({method, params, id}) => {
      const result = api[method](...params)
      Promise.resolve(result).then(x => {
        if (x.subscribe) {
          observables.set(id, x)
          channel.main.send({id, result: true, observable: true})
          console.log(observables)
        } else {
          channel.main.send({id, result: x})
        }
      })
    }).subscribe()

  return channel.registers.map(remoteToLocal(channel))
}
