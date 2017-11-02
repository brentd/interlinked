import { Observable } from 'rxjs/Observable'

import 'rxjs/add/observable/interval'
import 'rxjs/add/observable/from'
import 'rxjs/add/operator/delay'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/merge'
import 'rxjs/add/operator/partition'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/take'
import 'rxjs/add/operator/takeUntil'

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
    channel.send({id, method: key, params})
    return channel.result$.merge(channel.error$)
      .filter(x => x.id === id)
      .take(1)
      .do(x => { if (x.error) throw new Error(x.error.message) })
      .map(x => x.observable ? createProxyObservable(channel, id) : x.result)
      .toPromise()
  }

// Returns an observable that, when subscribed to, notifies the remote
// to subscribe to the observable identified by `key`. The subscription
// forwards all events received from the remote to the observer.
const createProxyObservable = (channel, key) =>
  Observable.create(observer => {
    const id = nextRequestId()
    const stop = channel.complete$
      .merge(channel.error$)
      .filter(x => x.id === id)
      .do(x => { if (x.error) throw new Error(x.error.message) })
      .merge(channel.register$)
    const sub = channel.demux(id).takeUntil(stop).subscribe(observer)

    channel.send({id, subscribe: key})
    return () => {
      sub.unsubscribe()
      channel.send({unsubscribe: id})
    }
  })

// Sets up proxy functions and observables as defined by the serialized remote
// interface.
const registerRemote = (channel, definition, keys = []) => {
  return Object.entries(definition).reduce((local, [k, v]) => {
    const keyPath = keys.concat(k).join('.')
    switch (v) {
      case 'function':
        local[k] = createProxyFunction(channel, keyPath)
        break
      case 'observable':
        local[k] = createProxyObservable(channel, keyPath)
        break
      default:
        local[k] = registerRemote(channel, v, keys.concat(k))
    }
    return local
  }, {})
}

// Serializes an interface into a definition that can be sent over the wire.
const serializeRemote = api => {
  return Object.entries(api).reduce((definition, [k, v]) => {
    if (v.subscribe)
      definition[k] = 'observable'
    else if (typeof v === 'function')
      definition[k] = 'function'
    else if (typeof v === 'object' && v !== null)
      definition[k] = serializeRemote(v)
    return definition
  }, {})
}

// Represents the multiplexed, duplex pipe for a peer. Takes a deserialized
// stream as `input`, and a `sender` function to call when writing.
function Channel(input, sender) {
  const [muxed$, main$] = input.share().partition(x => x.constructor === Array)

  this.send  = sender
  this.mux   = (id, x) => sender([id, x])
  this.demux = id => muxed$.filter(x => x[0] === id).map(x => x[1])

  const normalize = key => x => { return { id: x[key] } }

  this.register$    = main$.filter(defined('register'))
  this.method$      = main$.filter(defined('method'))
  this.result$      = main$.filter(defined('result'))
  this.subscribe$   = main$.filter(defined('subscribe'))
  this.unsubscribe$ = main$.filter(defined('unsubscribe')).map(normalize('unsubscribe'))
  this.complete$    = main$.filter(defined('complete')).map(normalize('complete'))
  this.error$       = main$.filter(defined('error'))
}

export default function(input, output, api = {}) {
  const channel = new Channel(input, x => output.next(x))
  const anonObservables = new Map()

  channel.method$
    .map(({method, params, id}) => {
      try {
        const result = getKeyPath(api, method)(...params)
        Promise.resolve(result).then(x => {
          if (x.subscribe) {
            anonObservables.set(id, x)
            channel.send({id, result: null, observable: true})
          } else {
            channel.send({id, result: x})
          }
        })
      } catch(e) {
        channel.send({id, error: {message: e.message}})
      }
    }).subscribe()

  const subscribeLocal = (id, obs) =>
    obs
      .takeUntil(channel.unsubscribe$.filter(x => x.id === id))
      .subscribe(
        x   => channel.mux(id, x),
        err => channel.send({id, error: {message: err.message}}),
        ()  => channel.send({complete: id})
      )

  const [namedSubscribe$, anonSubscribe$] = channel.subscribe$
    .partition(({subscribe: key}) => typeof key === 'string')

  namedSubscribe$
    .map(({subscribe: keyPath, id}) => subscribeLocal(id, getKeyPath(api, keyPath)))
    .subscribe()
  anonSubscribe$
    .map(({subscribe: obsId, id}) => subscribeLocal(id, anonObservables.get(obsId)))
    .subscribe()

  setTimeout(() =>
    channel.send({register: serializeRemote(api)})
  , 0)

  return channel.register$
    .map(({register: definition}) => registerRemote(channel, definition))
}
