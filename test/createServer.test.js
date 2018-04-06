import { Observable } from 'rxjs/Observable'

import assert from 'assert'
import { marbles } from 'rxjs-marbles'

import createServer from '../src/createServer'

describe('createServer()', () => {
  it('returns an observable', marbles(m => {
    const server = createServer({})
    assert.equal(server.constructor, Observable)
  }))

  it('subscribes to the input stream once', marbles(m => {
    m.bind()

    const api = {
      fn:  () => 'cells',
      fn2: () => 'interlinked'
    }
    const input = m.hot('---|')
    const sub   =       '^--!'

    const server = createServer(api, input)

    server.subscribe()
    m.has(input, sub)
  }))

  context('publishing', () => {
    it('emits a publish message to the created observable', marbles(m => {
      m.bind()

      const input = m.cold('-')
      const server = createServer({}, input)

      const publish = {publish: {}}
      m.equal(server, 'p-', {p: publish})
    }))

    it('publishes functions', marbles(m => {
      m.bind()

      const api = {fn: () => 'cells'}
      const input = m.cold('-')
      const server = createServer(api, input)

      const publish = {
        publish: {
          fn: {_type: 'function'}
        }
      }
      m.equal(server, 'p-', {p: publish})
    }))

    it('publishes observables', marbles(m => {
      m.bind()

      const api = {obs: Observable.of(1,2,3)}
      const input = m.cold('-')
      const server = createServer(api, input)

      const publish = {
        publish: {
          obs: {_type: 'observable'}
        }
      }
      m.equal(server, 'p-', {p: publish})
    }))

    it('publishes nested functions and observables', marbles(m => {
      m.bind()

      const api = {
        obs: Observable.of(1,2,3),
        cells: () => 'cells',
        within: {
          obs: Observable.of(1,2,3),
          cells: () => 'cells'
        }
      }

      const input = m.cold('-')
      const server = createServer(api, input)

      const publish = {
        publish: {
          obs: {_type: 'observable'},
          cells: {_type: 'function'},
          within: {
            obs: {_type: 'observable'},
            cells: {_type: 'function'}
          }
        }
      }
      m.equal(server, 'p-', {p: publish})
    }))
  })

  context('api', () => {
    describe('functions', () => {
      let api

      const send = (...messages) => {
        const input = Observable.of(...messages).delay(1)
        const server = createServer(api, input)
        return server.skip(1).toArray().toPromise()
      }

      it('emits the function result', async () => {
        api = { foo: { fn: () => 'cells' } }
        const message  = {id: 1, method: 'foo.fn', params: []}
        const result = await send(message)
        assert.deepEqual(result, [{id: 1, result: 'cells'}])
      })

      it('calls the function the correct number of times', async () => {
        let n = 0
        api = { fn: () => { n++; return 'cells' } }
        const message  = {id: 1, method: 'fn', params: []}
        const result = await send(
          {id: 1, method: 'fn', params: []},
          {id: 2, method: 'fn', params: []}
        )
        assert.deepEqual(result, [
          {id: 1, result: 'cells'},
          {id: 2, result: 'cells'}
        ])
        assert.equal(n, 2)
      })

      it('emits error messages thrown by the function', async () => {
        api = { fn: () => { throw new Error('dreadfully') } }
        const message  = {id: 1, method: 'fn', params: []}
        const result = await send(message)
        assert.deepEqual(result, [{id: 1, error: {message: 'dreadfully'}}])
      })

      it('emits the message from rejected promises', async () => {
        api = { fn: () => Promise.reject(new Error('dreadfully')) }
        const message  = {id: 1, method: 'fn', params: []}
        const result = await send(message)
        assert.deepEqual(result, [{id: 1, error: {message: 'dreadfully'}}])
      })
    })

    describe('observables', () => {
      it('subscribes to the observable at the specified keypath', marbles(m => {
        m.bind()

        const message = {id: 1, subscribe: 'foo.obs'}

        const obs   = m.cold(  'a-b-c-|')
        const input = m.hot('---m------', {m: message})
        const sub   =       '---^-----!'

        const api = { foo: { obs } }
        createServer(api, input).subscribe()

        m.has(obs, sub)
      }))

      it('unsubscribes from observables when the input stream completes', marbles(m => {
        m.bind()

        const message = {id: 1, subscribe: 'obs'}

        const obs   = m.cold(  '--------')
        const input = m.hot('---m---|', {m: message})
        const sub   =       '---^---!'

        const api = { obs }
        createServer(api, input).subscribe()

        m.has(obs, sub)
      }))

      it('unsubscribes from the specified subscription id', marbles(m => {
        m.bind()

        const subscribe   = {id: 1, subscribe: 'obs'}
        const unsubscribe = {unsubscribe: 1}

        const obs   = m.cold(  'a-b-c-|')
        const input = m.hot('---s--u---', {s: subscribe, u: unsubscribe})
        const sub   =       '---^--!'

        const api = { obs }
        createServer(api, input).subscribe()

        m.has(obs, sub)
      }))

      it('forwards emissions with the transaction id of the subscribe', marbles(m => {
        m.bind()

        const message = {id: 123, subscribe: 'obs'}
        const values = {
          a: [123,'a'],
          b: [123,'b'],
          c: [123,'c']
        }

        const obs      = m.cold(  'a-b-c-')
        const input    = m.hot('---m-----', {m: message})
        const expected = m.hot('---a-b-c-', values)

        const api = { obs }
        const server = createServer(api, input)

        m.equal(server.skip(1), expected)
      }))

      it('sends a completion message when the observable completes', marbles(m => {
        m.bind()

        const message = {id: 123, subscribe: 'obs'}
        const values = {
          a: [123,'a'],
          b: [123,'b'],
          c: [123,'c'],
          C: {complete: 123}
        }

        const obs      = m.cold(  'a-b-c-|')
        const input    = m.hot('---m------', {m: message})
        const expected = m.hot('---a-b-c-C', values)

        const api = { obs }
        const server = createServer(api, input)

        m.equal(server.skip(1), expected)
      }))

      it('can subscribe to the same observable multiple times', marbles(m => {
        m.bind()

        const messages = {
          1: {id: 123, subscribe: 'obs'},
          2: {id: 124, subscribe: 'obs'}
        }

        const values = {
          1: [123,'a'],
          2: [123,'b'],
          3: [124,'a'],
          4: [123,'c'],
          5: {complete: 123},
          6: [124,'b'],
          7: [124,'c'],
          8: {complete: 124}
        }

        const obs       = m.cold(  'a---b---c|')
        const input     = m.hot('---1-----2-----------', messages)
        const expected  = m.hot('---1---2-3-456---78', values)
        const sub1      =       '   ^--------!'
        const sub2      =       '         ^--------!'

        const api = { obs }
        const server = createServer(api, input)

        m.equal(server.skip(1), expected)
        m.has(obs, [sub1, sub2])
      }))

    })
  })
})
