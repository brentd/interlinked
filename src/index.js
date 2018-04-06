import { Observable } from 'rxjs/Observable'

import createServer from './createServer'
import createProxy from './createProxy'
import { hasProperty } from './util'

export default function interlinked(obs, ...args) {
  const input = Observable.from(obs).share()
  let api, send

  if (typeof obs.next === 'function') {
    api  = args[0] || {}
    send = x => obs.next(x)
  } else {
    send = args[0]
    api  = args[1] || {}
  }

  const [publishes$, messages$] = input.partition(hasProperty('publish'))

  const proxies$ = publishes$.map(({publish: definition}) =>
    createProxy(definition, messages$)
  ).shareReplay(1)

  const serverOut$ = createServer(api, messages$)
  const proxyOut$  = proxies$.switchMap(obs => obs)

  Observable.merge(serverOut$, proxyOut$).subscribe(send)

  return proxies$.pluck('api')
}
