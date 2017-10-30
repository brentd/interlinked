import rx from 'rxjs'
import rprx from '../index.js'
import assert from 'assert'


function simulatedSockets() {
  const make = (n) => {
    return {
      in:  new rx.Subject().map(JSON.parse).log(n + ' <-').share(),
      out: new rx.Subject().map(JSON.stringify).delay(1).log(n + ' ->').share()
    }
  }

  const a = make('a')
  const b = make('b')

  a.out.subscribe(b.in)
  b.out.subscribe(a.in)

  return [a, b]
}

describe('rprx', () => {
  const connectedPeers = (apia = {}, apib = {}) => {
    const [a, b] = simulatedSockets()
    return [rprx(a.in, a.out, apia), rprx(b.in, b.out, apib)]
  }

  it('can subscribe to a remote observable', done => {
    const numbers = rx.Observable.from([1,2,3])
    const [a, b] = connectedPeers({numbers}, {})

    b.subscribe(remote => {
      remote.numbers.take(2).toArray().toPromise().then(x => {
        assert.deepEqual(x, [1,2])
        done()
      })
    })
  })

  it('knows when a remote observable completes', done => {
    const numbers = rx.Observable.from([1,2,3])
    const [a, b] = connectedPeers({numbers}, {})

    b.subscribe(remote => {
      remote.numbers.toArray().toPromise().then(x => {
        assert.deepEqual(x, [1,2,3])
        done()
      })
    })
  })

  it('can call a remote function and wait for a response as a promise', done => {
    const [a, b] = connectedPeers({fn: () => 'cells'}, {})

    b.subscribe(remote => {
      remote.fn().then(x => {
        assert.equal(x, 'cells')
        done()
      })
    })
  })

  it('when the remote function returns a promise', done => {
    const fn = () => new Promise(resolve => setTimeout(() => resolve('cells'), 1))
    const [a, b] = connectedPeers({fn}, {})

    b.subscribe(remote => {
      remote.fn().then(x => {
        assert.equal(x, 'cells')
        done()
      })
    })
  })

  it('when the remote function returns an observable', done => {
    const fn = () => new rx.Observable.from([1,2,3])
    const [a, b] = connectedPeers({fn}, {})

    b.subscribe(remote => {
      remote.fn().then(x => {
        x.toArray().toPromise().then(x => {
          assert.deepEqual(x, [1,2,3])
          done()
        })
      })
    })
  })

})
