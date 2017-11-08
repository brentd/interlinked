import { Observable } from 'rxjs/Observable'

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

const getKeyPath = (obj, keyPath) => keyPath.split('.').reduce((acc, k) => acc[k], obj)

// Returns a function that notifies the remote to execute the function
// identified by `key`. That function a Promise that will resolve when the
// remote responds with a return value.
const createProxyFunction = (channel, key) =>
  (...params) => {
    const id = nextRequestId()
    channel.send({id, method: key, params})
    return channel.result$.merge(channel.error$)
      .filter(x => x.id === id)
      .take(1)
      .do(x => { if (x.error) throw new Error(x.error.message) })
      .map(x => x.observable ? createProxyObservable(channel, x.result) : x.result)
      .toPromise()
  }

// Returns an observable that, when subscribed to, notifies the remote
// to subscribe to the observable identified by `key`. The subscription
// forwards all events received from the remote to the observer.
const createProxyObservable = (channel, key) =>
  Observable.create(observer => {
    const id = nextRequestId()
    const stop = channel.complete$.merge(channel.error$)
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
    switch (v.type) {
      case 'function':
        local[k] = createProxyFunction(channel, keyPath)
        break
      case 'observable':
        local[k] = createProxyObservable(channel, v.id)
        break
      case 'subject':
        local[k] = createProxyObservable(channel, v.id)
        break
      default:
        local[k] = registerRemote(channel, v, keys.concat(k))
    }
    return local
  }, {})
}

// Serializes an interface into a definition that can be sent over the wire.
const serializeRemote = (channel, api) => {
  return Object.entries(api).reduce((definition, [k, v]) => {
    if (v.subscribe) {
      const obsId = nextRequestId()
      channel.observables.set(obsId, v)
      definition[k] = {type: 'observable', id: obsId}
    } else if (v.next) {
      const obsId = nextRequestId()
      channel.observables.set(obsId, v)
      definition[k] = {type: 'subject', id: obsId}
    } else if (typeof v === 'function') {
      definition[k] = {type: 'function'}
    } else if (typeof v === 'object' && v !== null) {
      definition[k] = serializeRemote(channel, v)
    }
    return definition
  }, {})
}

// Represents the multiplexed, duplex pipe for a peer. Takes a deserialized
// stream as `input`, and a `sender` function to call when writing.
function Channel(input, sender) {
  const [muxed$, main$] = input.share().partition(x => x.constructor === Array)

  this.observables = new Map()

  this.send  = sender
  this.mux   = (id, x) => sender([id, x])
  this.demux = id => muxed$.filter(x => x[0] === id).map(x => x[1])

  const defined   = prop => x => x[prop] !== undefined
  const normalize = key => x => ({id: x[key]})

  this.register$    = main$.filter(defined('register'))
  this.method$      = main$.filter(defined('method'))
  this.result$      = main$.filter(defined('result'))
  this.subscribe$   = main$.filter(defined('subscribe'))
  this.unsubscribe$ = main$.filter(defined('unsubscribe')).map(normalize('unsubscribe'))
  this.complete$    = main$.filter(defined('complete')).map(normalize('complete'))
  this.error$       = main$.filter(defined('error'))
}

export default function(input, output, api = {}) {
  const sender = output.next ? x => output.next(x) : output
  const channel = new Channel(input, sender)

  channel.method$.subscribe(({method, params, id}) => {
    try {
      const result = getKeyPath(api, method)(...params)
      Promise.resolve(result).then(x => {
        if (x.subscribe) {
          const obsId = nextRequestId()
          channel.observables.set(obsId, x)
          channel.send({id, result: obsId, observable: true})
        } else {
          channel.send({id, result: x})
        }
      })
    } catch(e) {
      channel.send({id, error: {message: e.message}})
    }
  })

  channel.subscribe$.subscribe(({subscribe: obsId, id}) => {
    channel.observables.get(obsId)
      .takeUntil(channel.unsubscribe$.filter(x => x.id === id))
      .subscribe(
        x   => channel.mux(id, x),
        err => channel.send({id, error: {message: err.message}}),
        ()  => channel.send({complete: id})
      )
  })

  setTimeout(() =>
    channel.send({register: serializeRemote(channel, api)})
  , 0)

  return channel.register$.map(({register: definition}) => registerRemote(channel, definition))
}
