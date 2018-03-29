import { Observable } from 'rxjs'

import createServer from './createServer'
import createProxy from './createProxy'
import { hasProperty } from './util'

const log = msg => x => console.log(msg, x)
Observable.prototype.log = function(msg) { return this.do(log(msg)) }

export default function interlinked(subject, api = {}) {
  const input = Observable.from(subject).share()
  const [publishes$, rest$] = input.partition(hasProperty('publish'))

  const proxies$ = publishes$.map(({publish: definition}) =>
    createProxy(definition, rest$)
  ).shareReplay(1)

  const serverOut$ = createServer(api, input)
  const proxyOut$  = proxies$.switchMap(obs => obs)

  Observable.merge(serverOut$, proxyOut$).subscribe(x => subject.next(x))

  return proxies$.pluck('api')
}
