import { Subject, ReplaySubject } from 'rxjs'

import functionsMiddleware from './functions'
import { resetTxId } from '../util'

describe('functions middleware', () => {
  let input, output, middleware

  beforeEach(() => {
    input  = new Subject()
    output = new ReplaySubject()
    middleware = new functionsMiddleware(input, output)
  })

  describe('connected', () => {
    beforeEach(() => {
      output.subscribe(input)
    })

    it('calls the remote function and returns a static value', async () => {
      const fn = () => 'interlinked'
      const proxy = middleware.proxy(middleware.serve('fn', fn))
      expect(await proxy()).toBe('interlinked')
    }, 100)

    it('calls the remote function and returns a promise value', async () => {
      const fn = () => Promise.resolve('interlinked')
      const proxy = middleware.proxy(middleware.serve('fn', fn))
      expect(await proxy()).toBe('interlinked')
    })
  })

  describe('serve', () => {
    it('serializes the property', () => {
      const fn = () => {}
      const serialized = middleware.serve('fn', fn)

      expect(serialized).toEqual({ key: 'fn', type: 'function' })
    })

    it('ignores properties that are not functions', () => {
      const serialized = middleware.serve('fn', {})
      expect(serialized).toBeUndefined()
    })

    it('listens for function calls and executes them', () => {
      expect.assertions(1)

      const message  = { id: 1, method: 'fn', params: [] }
      const response = { id: 1, result: 'interlinked' }

      const fn = () => 'interlinked'

      middleware.serve('fn', fn)
      input.next(message)

      output.subscribe(x => {
        expect(x).toEqual(response)
      })
    })

    it('waits on functions that return a promise', done => {
      expect.assertions(1)

      const message  = { id: 1, method: 'fn', params: [] }
      const response = { id: 1, result: 'interlinked' }

      const fn = () => new Promise(resolve => setTimeout(() => resolve('interlinked'), 10))

      middleware.serve('fn', fn)
      input.next(message)

      output.subscribe(x => {
        expect(x).toEqual(response)
        done()
      })
    }, 100)

    it('serializes sync errors in the underlying function', done => {
      const message  = { id: 1, method: 'fn', params: [] }

      const fn = () => { throw new Error('dreadfully distinct')  }

      middleware.serve('fn', fn)
      input.next(message)

      output.subscribe(x => {
        expect(x).toEqual({ id: 1, error: { message: 'dreadfully distinct' } })
        done()
      })
    }, 100)

    it('serializes promise rejections', done => {
      const message  = { id: 1, method: 'fn', params: [] }

      const fn = () => new Promise((resolve, reject) => {
        setTimeout(() => { reject(new Error('dreadfully distinct')) }, 10)
      })

      middleware.serve('fn', fn)
      input.next(message)

      output.subscribe(x => {
        expect(x).toEqual({ id: 1, error: { message: 'dreadfully distinct' } })
        done()
      })
    }, 100)
  })

  describe('proxy', () => {
    beforeEach(() => resetTxId())

    it('creates a function for serialized function properties', () => {
      const result = middleware.proxy({ key: 'fn', type: 'function' })
      expect(result).toBeInstanceOf(Function)
    })

    it('ignores properties that are not type: function', () => {
      const result = middleware.proxy({ key: 'fn', type: 'fountain' })
      expect(result).toBeUndefined()
    })

    it('outputs a request with the function params when executed', () => {
      expect.assertions(1)
      const fn = middleware.proxy({ key: 'fn', type: 'function' })

      fn(['within', 'cells'], 'interlinked', Math.PI)

      const request = { id: 0, method: 'fn', params: [['within', 'cells'], 'interlinked', Math.PI] }

      output.subscribe(x => {
        expect(x).toEqual(request)
      })
    })

    it('returns a promise which resolves when the function response is received', () => {
      expect.assertions(1)
      const fn = middleware.proxy({ key: 'fn', type: 'function' })

      const response = { id: 0, result: 'interlinked' }

      const promise = fn()
      input.next(response)

      return expect(promise).resolves.toBe('interlinked')
    }, 100)

    it('rejects the promise if an error is received', () => {
      expect.assertions(1)
      const fn = middleware.proxy({ key: 'fn', type: 'function' })

      const response = { id: 0, error: { message: 'dreadfully' } }

      const promise = fn()
      input.next(response)

      return expect(promise).rejects.toMatchObject({ message: 'dreadfully' })
    }, 100)

    it('rejects the promise if the input completes before a response is received', () => {
      expect.assertions(1)
      const fn = middleware.proxy({ key: 'fn', type: 'function' })

      const promise = fn()
      input.complete()

      return expect(promise).rejects.toBeTruthy()
    }, 100)
  })
})
