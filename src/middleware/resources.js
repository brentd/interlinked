import { filter, publishReplay } from 'rxjs/operators'
import memoize from 'lodash/memoize'

import { mergeFunctionResult, createProxyFunction } from './functions'
import { serveObservable, proxyObservable } from './observables'
import { delayedRefCount } from '../rx/operators/delayedRefCount'

export default function(input, output) {
  return {
    serve(key, value) {
      if (value instanceof Resource) {
        const resource = value.config
        const methods = Object.keys(resource)

        if (resource.get) {
          input.pipe(
            serveObservable(`${key}.get`, id => resource.get(id))
          ).subscribe(output)
        }

        if (resource.index) {
          input.pipe(
            serveObservable(`${key}.index`, params => resource.index(...params))
          ).subscribe(output)
        }

        if (resource.update) {
          input.pipe(
            filter(({ method }) => method === `${key}.update`),
            mergeFunctionResult(({ method, params }) => resource.update(...params)),
          ).subscribe(output)
        }

        return { key, type: 'resource', methods }
      }
    },

    proxy({ key, type, methods }) {
      if (type === 'resource') {
        return methods.reduce((obj, method) => {
          switch (method) {
            case 'get':
              obj.get = memoize(id =>
                proxyObservable(`${key}.get`, input, output, id).pipe(
                  publishReplay(1),
                  delayedRefCount()
                )
              )
              break
            case 'index':
              obj.index = memoize((...params) =>
                proxyObservable(`${key}.index`, input, output, params).pipe(
                  publishReplay(1),
                  delayedRefCount()
                )
              )
              break
            case 'update':
              obj.update = createProxyFunction(`${key}.update`, input, output)
              break
            default:
          }

          return obj
        }, {})
      }
    }
  }
}

export const makeResource = config => new Resource(config)

export function Resource(config) {
  this.config = config
}
