import { ReplaySubject, of } from 'rxjs'
import { take, tap } from 'rxjs/operators'
import { marbles } from 'rxjs-marbles/jest'

import interlinked from './index'
import { resetTxId } from './util'

describe('interlinked()', () => {
  let output

  beforeEach(() => {
    output = new ReplaySubject()
  })

  describe('publishing', () => {
    it('emits an empty publish message when no api is provided', marbles(m => {
      const input = m.hot('-')

      input.pipe(interlinked()(output)).subscribe()

      m.equal(output, 'x', {
        x: { publish: [] }
      })
    }))

    it('emits an empty proxy api upon receiving an empty publish', marbles(m => {
      const link = interlinked()

      const input = m.hot('--x', {
        x: { publish: [] }
      })

      m.equal(input.pipe(link(output)), '--x', {
        x: {}
      })
    }))

    it('never emits a proxy api if no publish is received', marbles(m => {
      const link = interlinked()

      const input = m.hot('-')

      m.equal(input.pipe(link(output)), '-')
    }))
  })

  describe('middleware', () => {
    describe('serve', () => {
      it('applies the specified api as [keyPath, value] pairs to the middleware, using its return value to serialize the properties', () => {
        expect.assertions(1)

        const output = {
          next: (x) => {
            expect(x).toEqual({
              publish: [
                { serialized: ['within.cells', 'interlinked'] },
                { serialized: ['dreadfully', 'distinct'] }
              ]
            })
          }
        }

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

        const link = interlinked(api, [middleware])

        link(output)(of()).subscribe()
      })

      it('gives middlewares direct access to input excluding publishes', marbles(m => {
        const api = {
          within: 'cells'
        }

        const source = m.hot('p--x', {
          p: { publish: [{ key: 'within.cells' }] },
          x: 'interlinked'
        })

        const middleware = function(input, output) {
          return {
            serve: () => {
              m.equal(input, '---x', { x: 'interlinked' })
            }
          }
        }

        const link = interlinked(api, [middleware])

        source.pipe(link(output)).subscribe()
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

        source.pipe(link(output)).subscribe(remote => {
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

        const link = interlinked({}, [middleware])

        source.pipe(link(output)).subscribe()
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

        const link = interlinked({}, [middleware])
        source.pipe(link(output)).subscribe()

        m.equal(output, '(px)', {
          p: { publish: [] },
          x: 'interlinked'
        })
      }))
    })
  })
})
