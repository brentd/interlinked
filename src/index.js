import { partition, map, share } from 'rxjs/operators'
import isPlainObject from 'lodash/isPlainObject'
import set from 'lodash/set'

import { QueueingSubject } from './rx/QueueingSubject'
import functions from './middleware/functions'
import observables from './middleware/observables'
import resources, { Resource } from './middleware/resources'

export const defaultMiddlewares = [
  functions,
  observables,
  resources
]

export const resource = config => new Resource(config)

export default function interlinked(api = {}, middleware = defaultMiddlewares) {
  return output => source => {
    // Separate input into a stream of publishes and a stream of everything else.
    const [publishes$, messages$] = source.pipe(
      share(),
      partition(x => x.publish !== undefined)
    )

    // Instatiate the middlewares. Middlewares are given access to all input
    // except publishes, and direct write access to output.
    const stack = middleware.map(mdl => new mdl(messages$, output))

    // Publishes are transformed into a local proxy interface.
    const remotes$ = publishes$.pipe(
      map(({ publish: serializedProps }) => {
        console.log('hello')
        return createProxy(serializedProps, stack.map(mdl => mdl.proxy))
      })
    )

    // Create the server from middlewares and publish the serialized properties.
    const publishMessage = createServer(api, stack.map(mdl => mdl.serve))
    output.next(publishMessage)

    return remotes$
  }
}

// Transforms the specified api object into an output stream by asking all
// middlewares to listen to `input$` and respond however they want on `output$`.
function createServer(api, middlewares) {
  const properties = flattenObject(api).reduce((acc, [keyPath, value]) => {
    middlewares
      .filter(fn => typeof fn === 'function')
      .forEach(serve => {
        const result = serve(keyPath, value)
        result !== undefined && acc.push(result)
      })
    return acc
  }, [])

  return { publish: properties }
}

// "Recreates" the api by asking all middlewares to create a proxy object
// for each serialized api property. The proxy objects are responsible for
// sending messages to the server on ` and listening for a response on `input$`.
function createProxy(serializedProps, middlewares) {
  return serializedProps.reduce((api, prop) => {
    middlewares
      .filter(fn => typeof fn === 'function')
      .forEach(proxy => {
        const result = proxy(prop)
        result !== undefined && set(api, prop.key, result)
      })
    return api
  }, {})
}

// Flattens an object to an array of [keyPath, value] pairs.
const flattenObject = (obj, keyPath = '') =>
  Object.entries(obj).reduce((acc, [key, value]) =>
    isPlainObject(value)
      ? [...acc, ...flattenObject(value, `${keyPath}${key}.`)]
      : [...acc, [`${keyPath}${key}`, value]]
    , [])
