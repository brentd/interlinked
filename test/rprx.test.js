import rx from 'rxjs'
import rprx from '../index.js'
import assert from 'assert'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

function simulatedSockets() {
  const make = (n) => {
    return {
      in:  new rx.Subject().map(JSON.parse),
      out: new rx.Subject().map(JSON.stringify).log(n + ' ->')
    }
  }

  const a = make('a')
  const b = make('b')

  a.out.subscribe(b.in)
  b.out.subscribe(a.in)

  return [a, b]
}

const connectedPeers = async (apia = {}, apib = {}) => {
  const [a, b] = simulatedSockets()
  return await Promise.all([
    rprx(a.in, a.out, apia).first().toPromise(),
    rprx(b.in, b.out, apib).first().toPromise()
  ])
}

describe('rprx', () => {
  context('remote observables', () => {
    it('can subscribe', async () => {
      const numbers = rx.Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      return b.numbers.take(2).toArray().toPromise().then(x => {
        assert.deepEqual(x, [1,2])
      })
    })

    it('completes the local subscription', async () => {
      const numbers = rx.Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      return b.numbers.toArray().toPromise().then(x => {
        assert.deepEqual(x, [1,2,3])
      })
    })
  })

  it('can call a remote function and wait for a response as a promise', async () => {
    const fn = () => 'cells'
    const [a, b] = await connectedPeers({fn}, {})

    return b.fn().then(x => {
      assert.equal(x, 'cells')
    })
  })

  it('when the remote function returns a promise', async () => {
    const fn = () => new Promise(resolve => setTimeout(() => resolve('cells'), 1))
    const [a, b] = await connectedPeers({fn}, {})

    return b.fn().then(x => {
      assert.equal(x, 'cells')
    })
  })

  it('can register a nested interface', async () => {
    const fn = () => 'interlinked'
    const [a, b] = await connectedPeers({cells: {within: {cells: fn}}}, {})

    return b.cells.within.cells().then(x => {
      assert.equal(x, 'interlinked')
    })
  })

  it('when the remote function returns an observable', async () => {
    const fn = () => new rx.Observable.from([1,2,3])
    const [a, b] = await connectedPeers({fn}, {})

    const obs = await b.fn()

    return obs.toArray().toPromise().then(x => {
      assert.deepEqual(x, [1,2,3])
    })
  })

})
