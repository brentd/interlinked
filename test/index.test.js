import { Observable } from 'rxjs'
import { Subject } from 'rxjs'
import assert from 'assert'
import { marbles } from 'rxjs-marbles'

import interlinked from '../src/index'
import { resetTxId } from '../src/util'

const log = msg => x => console.log(msg, x)

// Returns two connected Subjects, such that:
//
//   const [a, b] = simulatedSockets()
//   a.next('hello b') // emits on `b`
//   b.next('hello a') // emits on `a`
//
function simulatedSockets() {
  const outA = new Subject().map(JSON.stringify).do(x => console.log('a.out', x)).share()
  const outB = new Subject().map(JSON.stringify).do(x => console.log('b.out', x)).share()

  return [
    Subject.create(outA, outB).map(JSON.parse),
    Subject.create(outB, outA).map(JSON.parse)
  ]
}

function link(a, apiA, b, apiB) {
  return Promise.all([
    interlinked(a, apiA).take(1).toPromise(),
    interlinked(b, apiB).take(1).toPromise()
  ])
}

describe('interlinked()', () => {
  let a, b

  beforeEach(() => {
    [a, b] = simulatedSockets()
    resetTxId()
  })

  describe('publishing', () => {
    it('publishes an api to both peers', async () => {
      const api = {fn: () => 'cells'}
      const [proxyA, proxyB] = await link(a, api, b, api)

      assert.equal(typeof proxyA.fn, 'function')
      assert.equal(typeof proxyB.fn, 'function')
    })

    it('caches the last published proxy', async () => {
      const api = {fn: () => 'cells'}

      interlinked(a, api)
      const proxies = interlinked(b)

      const proxy1 = await proxies.take(1).toPromise()
      const proxy2 = await proxies.take(1).toPromise()

      assert.equal(typeof proxy1.fn, 'function')
      assert.equal(typeof proxy2.fn, 'function')
    })

    it('publishes again when called on the same socket', async () => {
      const api = {fn: () => 'cells'}
      const proxies = interlinked(b)

      // Initial publish with no interface
      interlinked(a, {})

      const proxy1 = await proxies.take(1).toPromise()
      assert.equal(proxy1.fn, undefined)

      // Republish with an interface
      interlinked(a, api)

      // Wait so we don't get the cached previous publish
      await Observable.timer(10).toPromise()

      const proxy2 = await proxies.take(1).toPromise()
      assert.equal(typeof proxy2.fn, 'function')
    })
  })

  describe('functions', () => {
    it('returns a promise that resolves to the return value of the remote function', async () => {
      let n = 0
      const api = { fn: () => n++ }

      const [proxyA, proxyB] = await link(a, api, b, {})

      assert.equal(await proxyB.fn(), 0)
      assert.equal(await proxyB.fn(), 1)
      assert.equal(await proxyB.fn(), 2)
    })

    it('resolves promises after the api is re-published', async () => {
      const api = {
        fn: () => Observable.timer(50).mapTo('cells').toPromise()
      }
      const [proxyA, proxyB] = await link(a, api, b, {})

      const promise = proxyB.fn()

      // Republish the api with a different interface
      await Observable.timer(10).toPromise()
      interlinked(a, {fn: () => 'dreadfully'})

      assert.equal(await promise, 'cells')
    })

    it('rejects the promise when the remote throws an error', async () => {
      const api = {
        fn: () => { throw new Error('dreadfully') }
      }

      const [proxyA, proxyB] = await link(a, api, b, {})

      try {
        await proxyB.fn()
        assert.fail('Expected the promise to be rejected')
      } catch (e) {
        assert.equal(e.message, 'dreadfully')
      }
    })

    it('rejects the promise if the remote disconnects', async () => {
      const api = {
        fn: () => Observable.timer(50).mapTo('cells').toPromise()
      }

      const [proxyA, proxyB] = await link(a, api, b, {})

      try {
        const promise = proxyB.fn()
        a.complete()
        await promise
        assert.fail('Expected the promise to be rejected')
      } catch (e) {
        assert.equal(e.name, 'RemoteDisconnectedError')
      }
    })
  })

  describe('observables', () => {
    it('can simultaneously stream values from observables on both sides', marbles(m => {
      m.bind()

      const obsA = m.cold('a-b-c|')
      const obsB = m.cold('x-y-z|')
      const sub =         '^----!'

      const proxyA = interlinked(b, {obsA}).take(1)
      const proxyB = interlinked(a, {obsB}).take(1)

      m.equal(proxyA.mergeMap(remote => remote.obsB), obsB)
      m.equal(proxyB.mergeMap(remote => remote.obsA), obsA)

      m.has(obsA, sub)
      m.has(obsB, sub)
    }))
  })
})
