import rx from 'rxjs'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

let subscriptionId = 0

const remoteToLocal = channel => remote => {
  return Object.entries(remote).reduce((local, [k, v]) => {
    if (v.type === 'observable') {
      const proxy = rx.Observable.create(observer => {
        const id = subscriptionId++
        const complete = channel.completes.filter(x => x === id)
        const sub = channel.demux(id).takeUntil(complete).subscribe(observer)
        channel.main.send({subscribe: k, id})
        return () => {
          sub.unsubscribe()
          channel.main.send({unsubscribe: id})
        }
      })
      local[k] = proxy.takeUntil(channel.registers)
    } else if (v.type === 'function') {
      local[k] = () => console.log('calling function', k)
    } else {
      local[k] = remoteToLocal(v)
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
      .filter(x => x.register)
      .pluck('register')

    this.subscribes = this.main.in
      .filter(x => x.subscribe != undefined)
      .map(({subscribe, id}) => [subscribe, id])

    this.unsubscribes = this.main.in
      .filter(x => x.unsubscribe != undefined)
      .pluck('unsubscribe')

    this.completes = this.main.in
      .filter(x => x.complete != undefined)
      .pluck('complete')
  }

  demux(id) {
    return this.input.filter(x => x[0] === id).map(x => x[1])
  }
}

export default function(input, output, api) {
  const channel = new Channel(input, x => output.next(x))

  if (api && Object.keys(api).length > 0)
    channel.main.send({register: localToRemote(api)})

  channel.subscribes
    .map(([name, id]) =>
      api[name]
        .takeUntil(channel.unsubscribes.filter(x => x === id))
        .subscribe(
          x   => channel.send(id, x),
          err => channel.main.send({error: id}),
          ()  => channel.main.send({complete: id})
        )
    )
    .subscribe()

  return channel.registers.map(remoteToLocal(channel))
}
