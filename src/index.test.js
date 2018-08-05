import { ReplaySubject, of } from 'rxjs'
import { take } from 'rxjs/operators'
import { marbles } from 'rxjs-marbles/jest'

import interlinked from './index'
import { resetTxId } from './util'

describe('interlinked()', () => {
  describe('e2e', () => {
    function link(apiA, apiB) {
      const a = new ReplaySubject()
      const b = new ReplaySubject()

      const linkA = interlinked(apiA)
      const linkB = interlinked(apiB)

      a.pipe(linkA).subscribe(b)
      b.pipe(linkB).subscribe(a)

      return [linkA, linkB]
    }

    beforeEach(() => {
      resetTxId()
    })

    it('publishes an api to both peers', async () => {
      const apiA = { fnA: () => {} }
      const apiB = { fnB: () => {} }
      const [linkA, linkB] = link(apiA, apiB)

      const proxyA = await linkA.remotes.pipe(take(1)).toPromise()
      const proxyB = await linkB.remotes.pipe(take(1)).toPromise()

      expect(proxyA.fnB).toBeInstanceOf(Function)
      expect(proxyB.fnA).toBeInstanceOf(Function)
    }, 100)
  })

  describe('publishing', () => {
    it('emits an empty publish message when no api is provided', marbles(m => {
      const input = m.hot('-')

      m.equal(input.pipe(interlinked()), 'x', {
        x: { publish: [] }
      })
    }))

    it('emits an empty proxy api when receiving an empty publish', marbles(m => {
      const link = interlinked()

      const input = m.hot('--x', {
        x: { publish: [] }
      })

      input.pipe(link).subscribe()

      m.equal(link.remotes, '--x', {
        x: {}
      })
    }))

    it('never emits a proxy api if no publish is received', marbles(m => {
      const link = interlinked()

      const input = m.hot('-')

      input.pipe(link).subscribe()

      m.equal(link.remotes, '-')
    }))
  })

  describe('middleware', () => {
    describe('serve', () => {
      it('applies the specified api as [keyPath, value] pairs to the middleware, using its return value to serialize the properties', () => {
        expect.assertions(1)

        const api = {
          within: {
            cells: 'interlinked'
          },
          dreadfully: 'distinct'
        }

        const middleware = function() {
          return {
            serve: (key, value) => {
              return { serialized: [key, value] }
            }
          }
        }

        of().pipe(interlinked(api, [middleware])).subscribe(x => {
          expect(x).toEqual({
            publish: [
              { serialized: ['within.cells', 'interlinked'] },
              { serialized: ['dreadfully', 'distinct'] }
            ]
          })
        })
      })

      it('gives middlewares direct access to input excluding publishes', marbles(m => {
        expect.assertions(1)

        const api = {
          within: 'cells'
        }

        const source = m.hot('p--x', {
          p: { publish: [{ key: 'within.cells' }] },
          x: 'interlinked'
        })

        const middleware = function(input, output) {
          return {
            serve: (key, value) => {
              m.equal(input, '---x', { x: 'interlinked' })
            }
          }
        }

        source.pipe(interlinked(api, [middleware]))
      }))
    })

    describe('proxy', () => {
      it('applies published property objects to the middleware, setting its return value on the proxy api', () => {
        expect.assertions(2)

        const source = of({ publish: [{ key: 'within.cells' }] })

        const middleware = function() {
          return {
            proxy: obj => {
              expect(obj.key).toBe('within.cells')
              return 'interlinked'
            }
          }
        }

        const link = interlinked({}, [middleware])

        source.pipe(link)

        link.remotes.subscribe(remote => {
          expect(remote).toEqual({ within: { cells: 'interlinked' } })
        })
      })

      it('gives middlewares direct access to input excluding publishes', marbles(m => {
        expect.assertions(1)

        const source = m.hot('p--x', {
          p: { publish: [{ key: 'within.cells' }] },
          x: 'cells'
        })

        const middleware = function(input, output) {
          return {
            proxy: prop =>
              m.equal(input, '---x', { x: 'cells' })
          }
        }

        source.pipe(interlinked({}, [middleware]))
      }))

      it('gives middlewares direct access to output after publishing', marbles(m => {
        const source = m.hot('x', {
          x: { publish: [{ key: 'within.cells' }] }
        })

        const middleware = function(input, output) {
          return {
            proxy: prop => output.next('interlinked')
          }
        }

        m.equal(source.pipe(interlinked({}, [middleware])), '(px)', {
          p: { publish: [] },
          x: 'interlinked'
        })
      }))
    })
  })
})
