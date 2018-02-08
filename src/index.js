import { Observable } from 'rxjs/Observable'

import 'rxjs/add/operator/count'
import 'rxjs/add/operator/do'
import 'rxjs/add/operator/filter'
import 'rxjs/add/operator/map'
import 'rxjs/add/operator/merge'
import 'rxjs/add/operator/mergeMap'
import 'rxjs/add/operator/partition'
import 'rxjs/add/operator/share'
import 'rxjs/add/operator/take'
import 'rxjs/add/operator/takeUntil'
import 'rxjs/add/operator/finally'
import 'rxjs/add/operator/publishReplay'

let peerId = 0
const nextPeerId = () => peerId++

// Returns a function that notifies the remote to execute the method identified
// by `key`. The function returns a Promise that will resolve when the
// remote responds with a result.
const createProxyFunction = (channel, key) =>
  (...params) => {
    const id = nextPeerId()
    const promise =  channel.result$.merge(channel.error$)
      .takeUntil(channel.disconnect$)
      .takeUntil(channel.register$)
      .filter(x => x.id === id)
      .take(1)
      .do(x => { if (x.error) throw new Error(x.error.message) })
      .map(x => x.observable ? createProxyObservable(channel, x.result) : x.result)
      .toPromise()

    channel.send({id, method: key, params})

    return promise
  }

// Returns an observable that, when subscribed to, notifies the remote
// to subscribe to the observable identified by `key`. The subscription
// forwards all events received from the remote to the observer.
const createProxyObservable = (channel, key) =>
  Observable.create(observer => {
    const id = nextPeerId()
    const stop = channel.complete$.merge(channel.error$)
      .filter(x => x.id === id)
      .do(x => { if (x.error) throw new Error(x.error.message) })

    const sub = channel.demux(id)
      .takeUntil(channel.disconnect$)
      .takeUntil(channel.register$)
      .takeUntil(stop)
      .finally(() => channel.send({unsubscribe: id}))
      .subscribe(observer)

    channel.send({id, subscribe: key})

    return sub
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
        local[k] = createProxyObservable(channel, v.key)
        break
      case 'subject':
        local[k] = createProxyObservable(channel, v.key)
        local[k].next = x => channel.mux(v.key, x)
        break
      default:
        local[k] = registerRemote(channel, v, keys.concat(k))
    }
    return local
  }, {})
}

// Serializes an interface into a definition that can be sent over the wire,
// while also setting up listeners on the remote.
const serializeRemote = (channel, api, keys = []) => {
  return Object.entries(api).reduce((definition, [k, v]) => {
    const keyPath = keys.concat(k).join('.')
    if (typeof v.subscribe === 'function') {
      const obsId = nextPeerId()
      listenSubscribe(channel, v, obsId)

      if (typeof v.next === 'function') {
        listenNext(channel, v, obsId)
        definition[k] = {type: 'subject', key: obsId}
      } else {
        definition[k] = {type: 'observable', key: obsId}
      }
    } else if (typeof v === 'function') {
      listenMethod(channel, v, keyPath)
      definition[k] = {type: 'function'}
    } else if (typeof v === 'object' && v !== null) {
      definition[k] = serializeRemote(channel, v, keys.concat(k))
    }
    return definition
  }, {})
}

// Listen for the remote to call the local method `fn` identified by `name`.
const listenMethod = (channel, fn, name) =>
  channel.method$
    .filter(x => x.method === name)
    .subscribe(({method, params, id}) => {
      let result
      try {
        result = fn(...params)
      } catch(e) {
        return channel.send({id, error: {message: e.message}})
      }

      Promise.resolve(result).then(x => {
        if (x.subscribe) {
          const obsId = nextPeerId()
          listenSubscribe(channel, x, obsId)
          channel.send({id, result: obsId, observable: true})
        } else {
          channel.send({id, result: x})
        }
      }).catch(e => {
        channel.send({id, error: {message: e.message}})
      })
    })

// Listen for the remote to subscribe to the local observer `obs` identified by `obsId`.
const listenSubscribe = (channel, obs, obsId) =>
  channel.subscribe$
    .filter(x => x.subscribe === obsId)
    .mergeMap(({id}) =>
       obs
        .takeUntil(channel.disconnect$)
        .takeUntil(channel.unsubscribe$.filter(x => x.id === id))
        .do(
          x   => channel.mux(id, x),
          err => channel.send({id, error: {message: err.message}}),
          ()  => channel.send({complete: id})
        )
    ).subscribe({error: e => console.log('[interlinked]', e)})

// Listen for the remote to `next` values to the subject identified by `obsId`.
// This will also forward complete and error events to the subject.
const listenNext = (channel, subject, obsId) =>
  channel.demux(obsId).subscribe(subject)

// Represents the multiplexed, duplex pipe for a peer. Takes a deserialized
// stream as `input`, and a `sender` function to call when writing.
function Channel(input, sender) {
  input = input.share()
  const [muxed$, main$] = input.partition(x => x.constructor === Array)

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

  // This will emit when the input completes, e.g. from a socket disconnect.
  this.disconnect$  = input.count()
}

export default function(input, output, api = {}) {
  const sender = output.next ? x => output.next(x) : output
  const channel = new Channel(input, sender)

  const remotes$ = channel.register$
    .map(({register: definition}) => registerRemote(channel, definition))
    .publishReplay(1)

  remotes$.connect()

  channel.send({register: serializeRemote(channel, api)})

  return remotes$
}
