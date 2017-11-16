import { Observable } from 'rxjs/Observable'
import { Subject } from 'rxjs/Subject'
import { ReplaySubject } from 'rxjs/ReplaySubject'

import 'rxjs/add/observable/of'
import 'rxjs/add/operator/toArray'
import 'rxjs/add/operator/catch'

import interlinked from '../src'
import assert from 'assert'
import { marbles } from 'rxjs-marbles'

const log = msg => x => console.log(msg, x)

// Simulates a pair of network sockets that are connected and serialize their output.
function simulatedSockets() {
  const make = name => ({
    in:  new ReplaySubject(1).map(JSON.parse),
    out: new Subject().map(JSON.stringify).do(log(name + ' ->'))
  })

  const [a, b] = [make('a'), make('b')]

  a.out.subscribe(x => b.in.next(x))
  b.out.subscribe(x => a.in.next(x))

  return [a, b]
}

const link = (api) => {
  const [a, b] = simulatedSockets()
  interlinked(a.in, a.out, api)
  return interlinked(b.in, b.out, {})
}

const link2 = (apia, apib) => {
  const [a, b] = simulatedSockets()
  return [
    interlinked(a.in, a.out, apia),
    interlinked(b.in, b.out, apib)
  ]
}

const remotes = async (apia, apib) => {
  const [a, b] = link2(apia, apib)
  return Promise.all([
    a.take(1).toPromise(),
    b.take(1).toPromise()
  ])
}

describe('interlinked', () => {
  describe('remote functions', () => {
    it('provides a proxy to the remote function that returns a promise', async () => {
      const fn = () => 'cells'
      const [a, b] = await remotes({fn}, {})

      return b.fn().then(x => assert.equal(x, 'cells'))
    })

    context('when the remote function returns a promise', () => {
      it('resolves when the remote promise resolves', async () => {
        const fn = () => new Promise(resolve => setTimeout(() => resolve('cells'), 1))
        const [a, b] = await remotes({fn}, {})

        return b.fn().then(x => assert.equal(x, 'cells'))
      })
    })

    context('errors', () => {
      it('rejects the promise if a remote exception occurs', async () => {
        const fn = () => { throw new Error('dreadfully') }
        const [a, b] = await remotes({fn}, {})

        return b.fn()
          .then(x => assert(false, 'promise was not rejected'))
          .catch(x => assert.equal(x.message, 'dreadfully'))
      })
    })
  })

  describe('remote observables', () => {
    it('provides a proxy observable that emits values from the remote', marbles(m => {
      const obs = m.cold('a-b-c-')
      link({obs}).subscribe(remote => m.equal(remote.obs, 'a-b-c'))
    }))

    it('completes the proxy observable when the remote completes', marbles(m => {
      const obs = m.cold('---|')
      const subs =       '^--!'
      link({obs}).subscribe(remote => m.equal(remote.obs, obs))
      m.has(obs, subs)
    }))

    it('unsubscribes from the remote when the proxy observable unsubscribes', marbles(m => {
      const obs = m.cold('a-b-c|')
      const sub =        '^-!'

      link({obs}).subscribe(remote => remote.obs.take(2).subscribe())
      m.has(obs, sub)
    }))

    it('can simultaneously stream values from observables on both sides', marbles(m => {
      const obsA = m.cold('a-b-c|')
      const obsB = m.cold('x-y-z|')
      const sub =         '^----!'

      const [a, b] = link2({obsA}, {obsB})

      a.subscribe(remote => m.equal(remote.obsB, obsB))
      b.subscribe(remote => m.equal(remote.obsA, obsA))

      m.has(obsA, sub)
      m.has(obsB, sub)
    }))

    context('when the remote observable completes with an error', () => {
      it('throws the error locally', marbles(m => {
        const obs = m.cold('---#', null, new Error('dreadfully distinct'))
        const subs =       '^--!'

        link({obs}).subscribe(remote => m.equal(remote.obs, obs))
        m.has(obs, subs)
      }))

      it('allows the error to be caught', marbles(m => {
        const obs = m.cold('---#', null, new Error('dreadfully distinct'))

        link({obs}).subscribe(remote => {
          const proxy = remote.obs.catch(e => Observable.of('a'))
          m.equal(proxy, '---(a|)')
        })
      }))
    })

    context('when a remote function returns an observable', () => {
      it('returns a proxy observable that emits values from the remote', async () => {
        const fn = () => new Observable.of(1,2,3)
        const remote = await link({fn}).take(1).toPromise()

        const obs = await remote.fn()
        const x = await obs.toArray().toPromise()
        assert.deepEqual(x, [1,2,3])
      })
    })
  })

  describe('remote subjects', () => {
    it('can next() values on the local peer which forwards them to the remote', marbles(m => {
      const subject = new ReplaySubject(3)

      link({subject}).subscribe(remote => {
        remote.subject.next('a')
        remote.subject.next('b')
        remote.subject.next('c')
        m.equal(subject, '(abc)')
      })
    }))
  })

  describe('registration', () => {
    it('can register an interface on both peers', async () => {
      const fn = () => 'interlinked'
      const [a, b] = await remotes(
        {aFn: () => 'cells'},
        {bFn: () => 'interlinked'}
      )

      assert.equal(await b.aFn(), 'cells')
      assert.equal(await a.bFn(), 'interlinked')
    })

    it('can register a nested interface', async () => {
      const fn = () => 'interlinked'
      const [a, b] = await remotes({cells: {within: {cells: fn}}}, {})

      const x = await b.cells.within.cells()
      assert.equal(x, 'interlinked')
    })
  })
})
