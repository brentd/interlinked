import { ReplaySubject } from 'rxjs'
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
  const link = source => {
    const output$ = new QueueingSubject()

    // Separate input into a stream of publishes and a stream of everything else.
    const [publishes$, messages$] = source.pipe(
      share(),
      partition(x => x.publish !== undefined)
    )

    const stack = middleware.map(mware => new mware(messages$, output$))

    // Each time we receive a publish, it means a new server was created on the
    // remote. Map each publish to a new proxy interface for the client to use.
    // The proxy interfaces are sent to `link.remotes` as a side effect.
    publishes$.pipe(
      map(({ publish: serialized }) =>
        createProxy(serialized, stack)
      )
    ).subscribe(x => link.remotes.next(x))

    // Create the server from middlewares and publish the serialized properties.
    const publish = createServer(api, stack)
    output$.next(publish)

    return output$.asObservable()
  }

  link.remotes = new ReplaySubject(1)

  link.remote = null
  link.remotes.subscribe(api => link.remote = api)

  return link
}

// Transforms the specified api object into an output stream by asking all
// middlewares to listen to `input$` and respond however they want on `output$`.
function createServer(api, middlewares) {
  const properties = flattenObject(api).reduce((acc, [keyPath, value]) => {
    middlewares
      .map(mware => mware.serve)
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
// sending messages to the server on `output$` and listening for a response on `input$`.
function createProxy(serialized, middlewares) {
  return serialized.reduce((api, obj) => {
    middlewares
      .map(mware => mware.proxy)
      .filter(fn => typeof fn === 'function')
      .forEach(proxy => {
        const result = proxy(obj)
        result !== undefined && set(api, obj.key, result)
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
