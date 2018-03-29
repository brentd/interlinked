import { Observable } from 'rxjs'
import { resetTxId } from '../src/util'
import assert from 'assert'
import { marbles } from 'rxjs-marbles'

import createProxy from '../src/createProxy'

describe('createProxy', () => {
  beforeEach(() => {
    resetTxId()
  })

  describe('functions', () => {
    it('creates a proxy function that returns a promise', () => {
      const definition = {
        within: {
          cells: {_type: 'function'}
        }
      }
      const input = Observable.never()
      const {proxy: api, output} = createProxy(definition, input)

      assert.equal(typeof api.within.cells, 'function')
      assert(api.within.cells() instanceof Promise)
    })

    it('emits a method message when the proxy function is called', marbles(m => {
      const definition = {
        cells: {_type: 'function'}
      }
      const input = Observable.never()
      const {proxy: api, output} = createProxy(definition, input)

      const message = {id: 0, method: 'cells', params: []}
      const time     = m.time('--|')
      const expected = m.hot( '--m', {m: message})

      m.scheduler.schedule(() => api.cells(), time)
      m.equal(output, expected)
    }))

    it('resolves the promise when the input emits a result', marbles(async m => {
      const definition = {
        cells: {_type: 'function'}
      }
      const input = m.hot('--m', {m: {id: 0, result: 'interlinked'}})
      const {proxy: api, output} = createProxy(definition, input)

      const result = await api.cells()
      assert.equal(result, 'interlinked')
    }))

    it('throws an error if the input emits an error', marbles(async m => {
      const definition = {
        cells: {_type: 'function'}
      }
      const input = m.hot('--m', {m: {id: 0, error: {message: 'dreadfully'}}})
      const {proxy: api, output} = createProxy(definition, input)

      try {
        await api.cells()
        assert.fail('expected promise to throw')
      } catch(e) {
        assert.equal(e.name, 'Error')
        assert.equal(e.message, 'dreadfully')
      }
    }))
  })

  context('observables', () => {
    it('creates a proxy observable that outputs a message when subscribed to', marbles(m => {
      const definition = {
        within: {
          obs: {_type: 'observable'}
        }
      }
      const input = Observable.never()
      const {proxy: api, output} = createProxy(definition, input)

      assert(api.within.obs instanceof Observable)

      const message = {id: 0, subscribe: 'within.obs'}
      const time     = m.time('---|')
      const expected = m.hot( '---m', {m: message})

      m.scheduler.schedule(() => api.within.obs.subscribe(), time)
      m.equal(output, expected)
    }))

    it('sends an unsubscribe message when the proxy observable is unsubscribed from', marbles(m => {
      m.bind()

      const definition = {
        obs: {_type: 'observable'}
      }
      const input = Observable.never()
      const {proxy: api, output} = createProxy(definition, input)

      const subscribe = {id: 0, subscribe: 'obs'}
      const unsubscribe = {unsubscribe: 0}
      const time     = m.time('---|')
      const expected = m.hot( '---s--u', {s: subscribe, u: unsubscribe})
      const delay    = Observable.timer(time)

      delay.subscribe(() =>
        api.obs.takeUntil(delay).subscribe()
      )

      m.equal(output, expected)
    }))

    it('manages multiple subscriptions independently', marbles(m => {
      m.bind()

      const definition = {
        obs: {_type: 'observable'}
      }
      const input = Observable.never()
      const {proxy: api, output} = createProxy(definition, input)

      const delay = time => Observable.timer(time)

      const messages = {
        1: {id: 0, subscribe: 'obs'},
        2: {id: 1, subscribe: 'obs'},
        3: {unsubscribe: 0},
        4: {unsubscribe: 1}
      }

      const subTime   = m.time('---|')
      const unsubTime = m.time(   '-------|')
      const expected  = m.hot( '---(12)---(34)', messages)

      delay(subTime).subscribe(() => {
        api.obs.takeUntil(delay(unsubTime)).subscribe()
        api.obs.takeUntil(delay(unsubTime)).subscribe()
      })

      m.equal(output, expected)
    }))

    it('emits multiplexed messages corresponding to the subscription transaction id', marbles(m => {
      m.bind()

      const definition = {
        obs: {_type: 'observable'}
      }
      const messages = {
        1: [0, 'within'],
        2: [0, 'cells'],
        3: [123, 'no'],
      }
      const emits = {
        1: 'within',
        2: 'cells'
      }
      const input    = m.hot( '---------1-2-3', messages)
      const expected = m.cold('---------1-2--', emits)

      const {proxy: api, output} = createProxy(definition, input)

      m.equal(api.obs, expected)
    }))

    it('completes the proxy observable when a complete message is received', marbles(m => {
      const definition = {
        obs: {_type: 'observable'}
      }
      const messages = {
        1: [0, 'interlinked'],
        c: {complete: 0}
      }
      const input    = m.hot( '-1---c', messages)
      const expected = m.cold('-1---|', {1: 'interlinked'})

      const {proxy: api, output} = createProxy(definition, input)

      m.equal(api.obs, expected)
    }))

    it('completes the proxy observable with an error when an error message is received', marbles(m => {
      const definition = {
        obs: {_type: 'observable'}
      }
      const messages = {
        1: [0, 'interlinked'],
        e: {id: 0, error: {message: 'dreadfully distinct'}}
      }
      const input    = m.hot( '-1---e', messages)
      const expected = m.cold('-1---#', {1: 'interlinked'}, new Error('dreadfully distinct'))

      const {proxy: api, output} = createProxy(definition, input)

      m.equal(api.obs, expected)
    }))
  })
})
