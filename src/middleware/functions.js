import { of } from 'rxjs'
import { filter, take, map, mergeMap, catchError } from 'rxjs/operators'
import { throwRemoteErrors, throwOnDisconnect, nextTxId, hasProperty, hasId } from '../util'

export default function(input, output) {
  return {
    // Listens to input for requests to execute a function on the api.
    serve(key, value) {
      if (typeof value === 'function') {
        input.pipe(
          filter(({ method }) => method === key),
          mergeFunctionResult(({ params }) => value(...params))
        ).subscribe(output)

        return { key, type: 'function' }
      }
    },

    // Returns a function that asks the remote to execute the function and
    // returns a promise. The promise resolves with the remote's response.
    proxy({ key, type }) {
      if (type === 'function') {
        return createProxyFunction(key, input, output)
      }
    }
  }
}

export const mergeFunctionResult = project => {
  return source => source.pipe(
    mergeMap(data => {
      // TODO: throw a malformed request error if no id
      const { id } = data
      return of('').pipe(
        mergeMap(() => Promise.resolve(project(data))),
        map(result => ({ id, result })),
        catchError(e => {
          console.error(e)
          return of({ id, error: { message: e.message } })
        })
      )
    })
  )
}

export const createProxyFunction = (key, input, output) => {
  return (...params) => {
    const id = nextTxId()

    // Ask the server to execute the method.
    output.next({ id, method: key, params })

    // Return a promise that waits for the response.
    return input.pipe(
      filter(hasId(id)),
      throwRemoteErrors(id),
      throwOnDisconnect(`${key}()`),
      filter(hasProperty('result')),
      map(x => x.result),
      take(1),
    ).toPromise()
  }
}
