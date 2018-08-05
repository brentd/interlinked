import { Observable, Notification, of } from 'rxjs'
import { filter, map, mergeMap, takeUntil, materialize, dematerialize, count } from 'rxjs/operators'

import { nextTxId, RemoteError } from '../util'

export default function(input, output) {
  return {
    serve(key, value) {
      if (typeof value.subscribe === 'function' && typeof value.pipe === 'function') {
        input.pipe(serveObservable(key, () => value)).subscribe(output)
        return { key, type: 'observable' }
      }
    },

    proxy({ key, type }) {
      if (type === 'observable') {
        return proxyObservable(key, input, output)
      }
    }
  }
}

export const serveObservable = (key, getObs) => {
  return source => source.pipe(
    filter(x => x instanceof Array && x[1] === 'S' && x[2] === key),
    mergeMap(([id,,,...meta]) => {
      return of('').pipe(
        mergeMap(() => getObs(...meta)),
        serializeObservable(id),
        takeUntil(source.pipe(filter(x => x instanceof Array && x[0] === id && x[1] === 'U'))),
        // Normally, `mergeMap` will continue the outer observable until all
        // inner observables complete. We want to stop if the connection ends.
        takeUntil(source.pipe(count()))
      )
    })
  )
}

export const proxyObservable = (key, input, output, ...subscribeMeta) => {
  return new Observable(observer => {
    const id = nextTxId()

    const sub = input.pipe(deserializeObservable(id)).subscribe(observer)
    output.next([id, 'S', key, ...subscribeMeta])

    return () => {
      sub.unsubscribe()
      output.next([id, 'U'])
    }
  })
}

const serializeObservable = id =>
  source => source.pipe(
    materialize(),
    map(({ kind, value, error }) => {
      switch (kind) {
        case 'N': return [id, 'N', value]
        case 'C': return [id, 'C']
        case 'E': return [id, 'E', { message: error.message }]
        default:
      }
    })
  )

const deserializeObservable = id =>
  source => source.pipe(
    filter(x => x instanceof Array && x[0] === id && x[1] !== 'S'),
    map(([id, kind, value]) => {
      switch (kind) {
        case 'N': return Notification.createNext(value)
        case 'C': return Notification.createComplete()
        case 'E': return Notification.createError(new RemoteError(value.message))
        default: {
          throw new Error(`Can't deserialize ${JSON.stringify([id, kind, value])}`)
        }
      }
    }),
    dematerialize()
  )
