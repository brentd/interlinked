import rx from 'rxjs'

let reqId = 0
const nextRequestId = () => reqId++

const defined    = prop => x => x[prop] !== undefined
const getKeyPath = (obj, keyPath) => keyPath.split('.').reduce((acc, k) => acc[k], obj)

// Returns a function that notifies the remote to execute the function
// identified by `key`. Returns a Promise that will resolve when the
// remote responds with a return value.
const createProxyFunction = (channel, key) =>
  (...params) => {
    const id = nextRequestId()
    channel.main.send({method: key, params, id})
    return channel.results
      .filter(x => x.id === id)
      .take(1)
      .map(x => x.observable ? createProxyObservable(channel, id) : x.result)
      .toPromise()
  }

// Returns an observable that, when subscribed to, notifies the remote
// to subscribe to the observable identified by `key`. The subscription
// forwards all events received from the remote to the observer.
const createProxyObservable = (channel, key) =>
  rx.Observable.create(observer => {
    const id = nextRequestId()
    channel.main.send({subscribe: key, id})
    const stop = channel.completes.filter(x => x === id).merge(channel.registers)
    const sub = channel.demux(id).takeUntil(stop).subscribe(observer)
    return () => {
      sub.unsubscribe()
      channel.main.send({unsubscribe: id})
    }
  })

// Sets up proxy functions and observables as defined by the serialized remote
// interface.
const registerRemote = (channel, definition, keys = []) => {
  return Object.entries(definition).reduce((local, [k, v]) => {
    keys.push(k)
    const keyPath = keys.join('.')
    switch (v.type) {
      case 'function':
        local[k] = createProxyFunction(channel, keyPath)
        break
      case 'observable':
        local[k] = createProxyObservable(channel, keyPath)
        break
      default:
        local[k] = registerRemote(channel, v, keys)
    }
    return local
  }, {})
}

// Serializes an interface into a definition that can be sent over the wire.
const serializeRemote = api => {
  return Object.entries(api).reduce((definition, [k, v]) => {
    if (v.subscribe) {
      definition[k] = {key: k, type: 'observable'}
    } else if (typeof v === 'function') {
      definition[k] = {key: k, type: 'function'}
    } else if (typeof v === 'object' && v !== null) {
      definition[k] = serializeRemote(v)
    }
    return definition
  }, {})
}

// Represents the multiplexed pipe for a peer. Exists only to organize - it does
// not subscribe to any streams itself.
class Channel {
  constructor(input, sender) {
    this.input = input
    this.send = (id, x) => sender([id, x])

    this.main = {
      in: this.demux('@').share(),
      send: x => this.send('@', x)
    }

    this.registers    = this.main.in.filter(defined('register')).pluck('register')
    this.subscribes   = this.main.in.filter(defined('subscribe'))
    this.unsubscribes = this.main.in.filter(defined('unsubscribe')).pluck('unsubscribe')
    this.completes    = this.main.in.filter(defined('complete')).pluck('complete')
    this.methods      = this.main.in.filter(defined('method'))
    this.results      = this.main.in.filter(defined('result'))
    this.errors       = this.main.in.filter(defined('error'))
  }

  demux(id) {
    return this.input.filter(x => x[0] === id).map(x => x[1])
  }
}

export default function(input, output, api = {}) {
  const channel = new Channel(input, x => output.next(x))
  const anonObservables = new Map()

  channel.main.send({register: serializeRemote(api)})

  const subscribeLocal = (id, obs) =>
    obs.takeUntil(channel.unsubscribes.filter(x => x === id))
      .subscribe(
        x   => channel.send(id, x),
        err => channel.main.send({error: id}),
        ()  => channel.main.send({complete: id})
      )

  const [namedSubscribes, anonSubscribes] =
    channel.subscribes.partition(({subscribe: key}) => typeof key === 'string')

  namedSubscribes
    .map(({subscribe: key, id}) => subscribeLocal(id, getKeyPath(api, key)))
    .subscribe()

  anonSubscribes
    .map(({subscribe: key, id}) => subscribeLocal(id, anonObservables.get(key)))
    .subscribe()

  channel.methods
    .map(({method, params, id}) => {
      const result = getKeyPath(api, method)(...params)
      Promise.resolve(result).then(x => {
        if (x.subscribe) {
          anonObservables.set(id, x)
          channel.main.send({id, result: null, observable: true})
        } else {
          channel.main.send({id, result: x})
        }
      })
    }).subscribe()

  return channel.registers.map(remote => registerRemote(channel, remote))
}
