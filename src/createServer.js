import { Observable } from 'rxjs'
import { hasProperty } from './util'

import resource from './resource'

export default function createServer(api, input$) {
  return new Observable(observer => {
    input$ = input$.share()

    const reduce = (obj, keyPath = '') => {
      return Object.entries(obj).reduce((o, [k, v]) => {
        const thisKeyPath = keyPath + k

        if (typeof v === 'function') {
          functionListener(input$, thisKeyPath, v).subscribe(observer)
          o[k] = {_type: 'function'}
        } else if (typeof v.subscribe === 'function') {
          observableListener(input$, thisKeyPath, v).subscribe(observer)
          o[k] = {_type: 'observable'}
        } else if (v instanceof resource) {
          resourceListener(input$, thisKeyPath, v).subscribe(observer)
          o[k] = {_type: 'resource'}
        } else if (v !== null && typeof v === 'object') {
          o[k] = reduce(v, thisKeyPath + '.')
        }

        return o
      }, {})
    }

    Observable.timer(0).subscribe(() => {
      const definition = reduce(api)
      observer.next({publish: definition})
    })
  })
}

function functionListener(input$, keyPath, fn) {
  return input$
    .filter(hasProperty('method'))
    .filter(({method}) => method === keyPath)
    .mergeMap(({params, id: txId}) => {
      try {
        return Promise.resolve(fn(...params))
          .then(result => ({id: txId, result}))
          .catch(e => ({id: txId, error: {message: e.message}}))
      } catch(e) {
        return Observable.of({id: txId, error: {message: e.message}})
      }
    })
}

function observableListener(input$, keyPath, obs) {
  return input$
    .filter(hasProperty('subscribe'))
    .filter(({subscribe: key}) => key === keyPath)
    .mergeMap(({id: txId}) => wrapObservable(input$, obs, txId))
    .takeUntil(input$.last())
}

function resourceListener(input$, keyPath, resource) {
  return input$
    .filter(hasProperty('subscribe'))
    .filter(({subscribe: key}) => key.includes(keyPath + '.'))
    .mergeMap(({id: txId, subscribe: key}) => {
      const resourceId = key.replace(keyPath + '.', '')
      let obs

      if (resourceId === 'index') {
        obs = resource.index()
      } else {
        obs = resource.get(resourceId)
      }

      return wrapObservable(input$, obs, txId)
    })
    .takeUntil(input$.last())
}

function wrapObservable(input$, obs, txId) {
  const unsubscribe$ = input$
    .filter(hasProperty('unsubscribe'))
    .filter(({unsubscribe: id}) => id === txId)

  return new Observable(observer =>
    obs
      .map(x => [txId, x])
      .do({
        next: x => observer.next(x),
        complete: () => observer.next({complete: txId})
      })
      .takeUntil(unsubscribe$)
      .subscribe()
  )
}
