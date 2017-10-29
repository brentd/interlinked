import rx from 'rxjs'
import rprx from '../index.js'
import assert from 'assert'


function connectedStreams() {
  const make = (n) => {
    return {
      in:  new rx.Subject().map(JSON.parse).log(n + ' <-').share(),
      out: new rx.Subject().map(JSON.stringify).delay(10).log(n + ' ->').share()
    }
  }
  const a = make('a')
  const b = make('b')

  a.out.subscribe(x => b.in.next(x))
  b.out.subscribe(x => a.in.next(x))

  return [a, b]
}

describe('rprx', () => {
  it('can subsscribe to a remote source', done => {
    const [a, b] = connectedStreams()

    const numbers = rx.Observable.from([1,2,3])

    const server = rprx(a.in, a.out, {numbers})
    const client = rprx(b.in, b.out, {})

    client.subscribe(remote => {
      remote.numbers.take(2).toArray().toPromise().then(x => {
        assert.deepEqual(x, [1,2])
        done()
      })
    })
  })
})
