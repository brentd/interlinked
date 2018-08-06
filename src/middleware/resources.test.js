import { Subject, ReplaySubject, of } from 'rxjs'
import { toArray } from 'rxjs/operators'
import { marbles } from 'rxjs-marbles/jest'

import resourcesMiddleware, { makeResource } from './resources'
import { resetTxId, RemoteError } from '../util'

const observe = (obs, cb) => obs.pipe(toArray()).toPromise().then(cb)

describe('resources middleware', () => {
  let input, output

  beforeEach(() => {
    input  = new Subject()
    output = new ReplaySubject()
  })

  describe('connected', () => {
    let middleware

    beforeEach(() => {
      output.subscribe(input)
      // input.subscribe(x => console.log(x))
      middleware = new resourcesMiddleware(input, output)
    })

    describe('get()', () => {
      it('calls resource.get() with the id passed to proxy.get()', () => {
        const resource = makeResource({
          get: id => of(id)
        })

        const proxy = middleware.proxy(middleware.serve('replicants', resource))

        return observe(proxy.get(123), x => {
          expect(x).toEqual([123])
        })
      }, 100)

      it('throws an error on the proxy observable if resource.get() fails', () => {
        const resource = makeResource({
          get: id => { throw new Error('dreadfully distinct') }
        })

        const proxy = middleware.proxy(middleware.serve('replicants', resource))

        return expect(observe(proxy.get(123))).rejects.toEqual(new RemoteError('dreadfully distinct'))
      }, 100)
    })

    describe('index()', () => {
      it('calls resource.index() with the params passed to proxy.index()', () => {
        expect.assertions(2)

        const resource = makeResource({
          index: (...params) => {
            expect(params).toEqual([{ somearg: true }])
            return of(1,2,3)
          }
        })

        const proxy = middleware.proxy(middleware.serve('replicants', resource))

        return observe(proxy.index({ somearg: true }), x => {
          expect(x).toEqual([1,2,3])
        })
      }, 100)
    })

    describe('update()', () => {
      it('calls resource.update() with the params passed to proxy.update()', () => {
        expect.assertions(1)

        const resource = makeResource({
          update: (...params) => {
            expect(params).toEqual([{ somearg: true }])
          }
        })

        const proxy = middleware.proxy(middleware.serve('replicants', resource))

        return proxy.update({ somearg: true })
      }, 100)
    })
  })

  describe('serve', () => {
    it('serializes resource objects made with makeResource()', () => {
      const resource = makeResource({})
      const middleware = new resourcesMiddleware(input, output)
      const serialized = middleware.serve('replicants', resource)

      expect(serialized).toEqual({ key: 'replicants', type: 'resource', methods: [] })
    })

    it('serializes the supported methods of the resource object', () => {
      const resource = makeResource({
        get: () => {}
      })

      const middleware = new resourcesMiddleware(input, output)
      const serialized = middleware.serve('replicants', resource)

      expect(serialized).toEqual({ key: 'replicants', type: 'resource', methods: ['get'] })
    })

    it('returns nothing for non-resources', () => {
      const middleware = new resourcesMiddleware(input, output)
      const serialized = middleware.serve('replicants', {})
      expect(serialized).toBeUndefined()
    })

    // describe('get()', () => {
    //   it('calls resource.get() with the id of the subscribe key and serializes the returned observable', marbles(m => {
    //     const resource = makeResource({
    //       get: resourceId => of(resourceId)
    //     })
    //
    //     new resourcesMiddleware(input, output).serve('replicants', resource)
    //     input.next({ id: 0, subscribe: 'replicants.get', resourceId: 123 })
    //
    //     m.equal(output, '(xC)', {
    //       x: [0, 123],
    //       C: { complete: 0 }
    //     })
    //   }))
    //
    //   it('fff', marbles(m => {
    //     const resource = makeResource({
    //       get: resourceId => m.cold('a-b-c')
    //     })
    //
    //     const input = m.hot('s-u', {
    //       s: { id: 0, subscribe: 'replicants.get', resourceId: 123 },
    //       u: { unsubscribe: 0 }
    //     })
    //
    //     new resourcesMiddleware(input, output).serve('replicants', resource)
    //
    //     m.equal(output, 'a', {
    //       a: [0, 'a']
    //     })
    //   }))
    //
    //   it('serializes an error if resource.get() fails', marbles(m => {
    //     const resource = makeResource({
    //       get: id => { throw new Error('dreadfully distinct') }
    //     })
    //
    //     new resourcesMiddleware(input, output).serve('replicants', resource)
    //     input.next({ id: 0, subscribe: 'replicants.get', resourceId: 123 })
    //
    //     m.equal(output, 'E', {
    //       E: { id: 0, error: { message: 'dreadfully distinct' } }
    //     })
    //   }))
    // })
    //
    // describe('index()', () => {
    //   it('calls resource.index() and serializes the returned observable', marbles(m => {
    //     const resource = makeResource({
    //       index: () => m.cold('a-b-c')
    //     })
    //
    //     new resourcesMiddleware(input, output).serve('replicants', resource)
    //     input.next({ id: 0, subscribe: 'replicants.index' })
    //
    //     m.equal(output, 'a-b-c', {
    //       a: [0, 'a'],
    //       b: [0, 'b'],
    //       c: [0, 'c']
    //     })
    //   }))
    // })
    //
    // describe('update()', () => {
    //   it('calls resource.update() like a function and serializes the result', () => {
    //     expect.assertions(3)
    //
    //     const resource = makeResource({
    //       update: (resourceId, ...params) => {
    //         expect(resourceId).toBe('123')
    //         expect(params).toEqual(['a', 'b', 'c'])
    //         return resourceId
    //       }
    //     })
    //
    //     new resourcesMiddleware(input, output).serve('replicants', resource)
    //     input.next({ id: 0, method: 'replicants.update.123', params: ['a', 'b', 'c'] })
    //
    //     return output.take(1).toPromise().then(x => {
    //       expect(x).toEqual({ id: 0, result: '123' })
    //     })
    //   }, 100)
    // })

  })

  describe('proxy', () => {
    beforeEach(() => resetTxId())

    it('returns an object with supported methods', marbles(m => {
      const middleware = new resourcesMiddleware(input, output)
      const proxy = middleware.proxy({ key: 'replicants', type: 'resource', methods: ['get'] })

      expect(proxy.get).toBeInstanceOf(Function)
      expect(proxy.index).not.toBeInstanceOf(Function)
    }))
  })
})
