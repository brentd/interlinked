import { Subject, ReplaySubject, of } from 'rxjs'
import { take } from 'rxjs/operators'
import { marbles } from 'rxjs-marbles/jest'

import observablesMiddleware from './observables'
import { resetTxId, RemoteError } from '../util'

describe('observables middleware', () => {
  let input, output

  beforeEach(() => {
    input  = new Subject()
    output = new ReplaySubject()
  })

  describe('connected', () => {
    let middleware

    beforeEach(() => {
      output.subscribe(input)
      middleware = new observablesMiddleware(input, output)
    })

    it('correctly mirrors the underlying observable', marbles(m => {
      const obs = m.cold('a-b-c|')
      const proxy = middleware.proxy(middleware.serve('obs', obs))

      m.equal(proxy, 'a-b-c|')
    }))

    it('subscribes and unsubscribes the underlying observable', marbles(m => {
      const obs = m.hot('a-b-c')
      const proxy = middleware.proxy(middleware.serve('obs', obs))

      m.equal(proxy.pipe(take(2)), 'a-(b|)')
      m.equal(proxy.pipe(take(3)), 'a-b-(c|)')
      m.has(obs, ['^-!', '^---!'])
    }))
  })

  describe('serve', () => {
    it('serializes observables', () => {
      const middleware = new observablesMiddleware(input, output)
      const serialized = middleware.serve('obs', of())
      expect(serialized).toEqual({ key: 'obs', type: 'observable' })
      const serialized2 = middleware.serve('obs', new Subject())
      expect(serialized2).toEqual({ key: 'obs', type: 'observable' })
    })

    it('returns nothing for non-observables', () => {
      const middleware = new observablesMiddleware(input, output)
      const serialized = middleware.serve('obs', '')
      expect(serialized).toBeUndefined()
      const serialized2 = middleware.serve('obs', () => {})
      expect(serialized2).toBeUndefined()
    })

    it('subscribes and unsubscribes the underlying observable', marbles(m => {
      const obs = m.cold('-')

      const input = m.hot('--S---U', {
        S: [123, 'S', 'obs'],
        U: [123, 'U']
      })

      new observablesMiddleware(input, output).serve('obs', obs)

      m.has(obs, '--^---!')
    }))

    it('outputs the underlying observable values as [id, N, value]', marbles(m => {
      const obs = m.cold('a-b-c')
      new observablesMiddleware(input, output).serve('obs', obs)

      input.next([123, 'S', 'obs'])

      m.equal(output, 'a-b-c', {
        a: [123, 'N', 'a'],
        b: [123, 'N', 'b'],
        c: [123, 'N', 'c']
      })
    }))

    it('outputs a complete message when the underlying observable completes', marbles(m => {
      const obs = m.cold('a---|')
      new observablesMiddleware(input, output).serve('obs', obs)

      input.next([123, 'S', 'obs'])

      m.equal(output, 'a---C', {
        a: [123, 'N', 'a'],
        C: [123, 'C']
      })
    }))

    it('outputs an error message when the underlying observable throws', marbles(m => {
      const obs = m.cold('----#', undefined, new Error('dreadfully distinct'))
      new observablesMiddleware(input, output).serve('obs', obs)

      input.next([123, 'S', 'obs'])

      m.equal(output, '----E', {
        E: [123, 'E', { message: 'dreadfully distinct' }]
      })
    }))

    it('unsubscribes from the underlying observable and completes the output if the input completes', marbles(m => {
      const obs   = m.cold('a-b-c')
      const input = m.hot( '---|')

      new observablesMiddleware(input, output).serve('obs', obs)

      input.next([123, 'S', 'obs'])

      m.has(obs, '^--!')

      m.equal(output, 'a-b|', {
        a: [123, 'N', 'a'],
        b: [123, 'N', 'b']
      })
    }))

    it('can properly serialize subscriptions to multiple observables', marbles(m => {
      const obs1     = m.cold('a-b-c')
      const obs2     = m.cold('---x-y-z')
      const expected = m.hot( 'a-bxcy-z', {
        a: [1, 'N', 'a'],
        b: [1, 'N', 'b'],
        c: [1, 'N', 'c'],
        x: [2, 'N', 'x'],
        y: [2, 'N', 'y'],
        z: [2, 'N', 'z']
      })

      const middleware = new observablesMiddleware(input, output)
      middleware.serve('obs1', obs1)
      middleware.serve('obs2', obs2)

      input.next([1, 'S', 'obs1'])
      input.next([2, 'S', 'obs2'])

      m.equal(output, expected)
    }))
  })

  describe('proxy', () => {
    beforeEach(() => resetTxId())

    it('returns an observable that outputs a subscribe message when subscribed to', marbles(m => {
      const middleware = new observablesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'obs', type: 'observable' })

      proxy.subscribe()

      m.equal(output, 'S-', {
        S: [0, 'S', 'obs']
      })
    }))

    it('outputs an unsubscribe message when the proxy observable is unsubscribed from', marbles(m => {
      const middleware = new observablesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'obs', type: 'observable' })

      const sub = proxy.subscribe()
      m.scheduler.schedule(() => sub.unsubscribe(), m.time('---|'))

      m.equal(output, 'S--U', {
        S: [0, 'S', 'obs'],
        U: [0, 'U']
      })
    }))

    it('emits data from subscribed observables', marbles(m => {
      const input = m.hot('a--b', {
        a: [0, 'N', 'a'],
        b: [0, 'N', 'b']
      })

      const middleware = new observablesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'obs', type: 'observable' })

      m.equal(proxy, 'a--b')
    }))

    it('completes the proxy observable when a complete messsage is received', marbles(m => {
      const input = m.hot('a--C', {
        a: [0, 'N', 'a'],
        C: [0, 'C']
      })

      const middleware = new observablesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'obs', type: 'observable' })

      m.equal(proxy, 'a--|')
    }))

    it('throws an error on the proxy observable when an error message is received', marbles(m => {
      const input = m.hot('a--E', {
        a: [0, 'N', 'a'],
        E: [0, 'E', { message: 'dreadfully distinct' }]
      })

      const middleware = new observablesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'obs', type: 'observable' })

      m.equal(proxy, 'a--#', undefined, new RemoteError('dreadfully distinct'))
    }))
  })
})
