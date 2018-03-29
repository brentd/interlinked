import { Observable, Subject } from 'rxjs'
import { hasProperty, hasId, nextTxId } from './util'

export default function createProxy(definition, input$) {
  const output = new Subject()

  const reduce = (obj, keyPath = '') =>
    Object.entries(obj).reduce((o, [k, v]) => {
      const thisKeyPath = keyPath + k
      if (v._type === 'function') {
        o[k] = createProxyFunction(input$, thisKeyPath, x => output.next(x))
      } else if (v._type === 'observable') {
        o[k] = createProxyObservable(input$, thisKeyPath, x => output.next(x))
      } else if (v !== null && typeof v === 'object') {
        o[k] = reduce(v, thisKeyPath + '.')
      }
      return o
    }, {})

  const proxy = reduce(definition)

  return {proxy, output: output.asObservable()}
}

function createProxyFunction(input$, keyPath, send) {
  return (...params) => {
    const txId = nextTxId()
    const promise = throwOnError(input$, keyPath, txId)
      .filter(hasProperty('result'))
      .filter(hasId(txId))
      .take(1)
      .map(({result}) => result)
      .toPromise()

    send({id: txId, method: keyPath, params})

    return promise
  }
}

function createProxyObservable(input$, keyPath, send) {
  return new Observable(observer => {
    const txId = nextTxId()

    const complete$ = input$
      .filter(hasProperty('complete'))
      .filter(({complete: id}) => id === txId)

    const sub = throwOnError(input$, keyPath, txId)
      .finally(() => send({unsubscribe: txId}))
      .takeUntil(complete$)
      .filter(x => x[0] === txId)
      .map(x => x[1])
      .subscribe(observer)

    send({id: txId, subscribe: keyPath})

    return sub
  })
}

function throwOnError(input$, name, txId) {
  return input$.do({
    next: ({id, error}) => { if (error && id === txId) throw new Error(error.message) },
    complete: () => { throw new RemoteDisconnectedError() }
  })
}

class RemoteDisconnectedError extends Error {
  constructor(message) {
    super(message)
    this.name = "RemoteDisconnectedError"
  }
}