import rx from 'rxjs'
import rprx from '../index.js'
import assert from 'assert'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

// Simulates a pair of network sockets that are connected and serialize their output.
function simulatedSockets() {
  const make = name => {
    return {
      in:  new rx.Subject().delay(1).map(JSON.parse),
      out: new rx.Subject().delay(1).map(JSON.stringify).log(name + ' ->')
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
    rprx(a.in, a.out, apia).first().toPromise(),
    rprx(b.in, b.out, apib).first().toPromise()
  ])
}

describe('rprx', () => {
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
  })

  describe('remote observables', () => {
    it('provides a proxy observable that emits values from the remote', async () => {
      const numbers = rx.Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      const x = await b.numbers.take(2).toArray().toPromise()
      assert.deepEqual(x, [1,2])
    })

    it('completes the proxy observable when the remote completes', async () => {
      const numbers = rx.Observable.from([1,2,3])
      const [a, b] = await connectedPeers({numbers}, {})

      const x = await b.numbers.toArray().toPromise()
      assert.deepEqual(x, [1,2,3])
    })

    it('can simultaneously stream values from observables on both sides', async () => {
      const numbers = rx.Observable.interval(1).take(3)
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

    context('when a remote function returns an observable', () => {
      it('returns a proxy observable that emits values from the remote', async () => {
        const fn = () => new rx.Observable.from([1,2,3])
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
