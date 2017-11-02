import { Observable } from 'rxjs/Observable'
import { Subject } from 'rxjs/Subject'

import 'rxjs/add/operator/toArray'

import interlinked from '../src'
import assert from 'assert'

Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

// Simulates a pair of network sockets that are connected and serialize their output.
function simulatedSockets() {
  const make = name => {
    return {
      in:  new Subject().delay(1).map(JSON.parse),
      out: new Subject().delay(1).map(JSON.stringify).log(name + ' ->')
    }
  }

  const [a, b] = [make('a'), make('b')]

  a.out.subscribe(b.in)
  b.out.subscribe(a.in)

  return [a, b]
}

const connectedPeers = async (apia = {}, apib = {}) => {
  const [a, b] = simulatedSockets()
  return await Promise.all([
    interlinked(a.in, a.out, apia).take(1).toPromise(),
    interlinked(b.in, b.out, apib).take(1).toPromise()
  ])
}

describe('interlinked', () => {
  describe('remote functions', () => {
    it('provides a proxy to the remote function that returns a promise', async () => {
      const fn = () => 'cells'
      const [a, b] = await connectedPeers({fn}, {})

      return b.fn().then(x => assert.equal(x, 'cells'))
    })

    context('when the remote function returns a promise', () => {
      it('resolves when the remote promise resolves', async () => {
        const fn = () => new Promise(resolve => setTimeout(() => resolve('cells'), 10))
        const [a, b] = await connectedPeers({fn}, {})

        return b.fn().then(x => assert.equal(x, 'cells'))
      })
    })

    context('errors', () => {
      it('rejects the promise if a remote exception occurs', async () => {
        const fn = () => { throw new Error('dreadfully') }
        const [a, b] = await connectedPeers({fn}, {})

        return b.fn()
          .then(x => assert(false, 'promise was not rejected'))
          .catch(x => assert.equal(x.message, 'dreadfully'))
      })
    })
  })

  describe('remote observables', () => {
    it('provides a proxy observable that emits values from the remote', async () => {
      const numbers = Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      const x = await b.numbers.take(2).toArray().toPromise()
      assert.deepEqual(x, [1,2])
    })

    it('completes the proxy observable when the remote completes', async () => {
      const numbers = Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      const x = await b.numbers.toArray().toPromise()
      assert.deepEqual(x, [1,2,3])
    })

    it('unsubscribes from the remote when the proxy observable unsubscribes', async () => {
      let n = 0
      const numbers = Observable.interval(10).take(3).do(() => n++)
      const [a, b] = await connectedPeers({numbers}, {})

      const x = await b.numbers.take(2).toArray().toPromise()
      assert.deepEqual(x, [0,1])

      await new Promise(resolve => setTimeout(() => {
        assert.equal(n, 2)
        resolve()
      }, 30))
    })

    it('can simultaneously stream values from observables on both sides', async () => {
      const numbers = Observable.interval(1).take(3)
      const [a, b] = await connectedPeers(
        {numbers: numbers.map(x => x + 10)},
        {numbers: numbers.map(x => x + 20)}
      )

      const aNumbers = b.numbers.toArray().toPromise()
      const bNumbers = a.numbers.toArray().toPromise()

      return Promise.all([
        aNumbers.then(x => assert.deepEqual(x, [10, 11, 12])),
        bNumbers.then(x => assert.deepEqual(x, [20, 21, 22]))
      ])
    })

    context('when the remote observable completes with an error', async () => {
      it('completes the proxy observable when the remote completes', async () => {
        const numbers = Observable.from([1,2,3])
          .do(x => { if (x === 2) throw new Error('dreadfully') })

        const [a, b] = await connectedPeers({numbers}, {})

        return b.numbers.toArray().toPromise()
          .then(x => assert.fail('subscription did not error'))
          .catch(x => assert.equal(x.message, 'dreadfully'))
      })
    })

    context('when a remote function returns an observable', () => {
      it('returns a proxy observable that emits values from the remote', async () => {
        const fn = () => new Observable.from([1,2,3])
        const [a, b] = await connectedPeers({fn}, {})

        const obs = await b.fn()
        const x = await obs.toArray().toPromise()
        assert.deepEqual(x, [1,2,3])
      })
    })
  })

  describe('registration', () => {
    it('can register an interface on both peers', async () => {
      const fn = () => 'interlinked'
      const [a, b] = await connectedPeers(
        {aFn: () => 'cells'},
        {bFn: () => 'interlinked'}
      )

      assert.equal(await b.aFn(), 'cells')
      assert.equal(await a.bFn(), 'interlinked')
    })

    it('can register a nested interface', async () => {
      const fn = () => 'interlinked'
      const [a, b] = await connectedPeers({cells: {within: {cells: fn}}}, {})

      const x = await b.cells.within.cells()
      assert.equal(x, 'interlinked')
    })
  })
})