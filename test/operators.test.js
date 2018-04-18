import 'rxjs/add/operator/publish'
import 'rxjs/add/operator/scan'
import 'rxjs/add/operator/switchMap'
import 'rxjs/add/operator/take'

import { timer } from 'rxjs/observable/timer'

import { marbles } from 'rxjs-marbles'
import { delayedRefCount } from '../src/operators'

describe('delayedRefCount()', () => {
  it('delays unsubscribing from a connectable observable until the next tick by default', marbles(m => {
    m.bind()

    const source = m.cold('-a-b-c')
    const subs   =        '^----!'

    const delayed = source.publish().pipe(delayedRefCount())
    delayed.take(2).subscribe()
    delayed.take(3).subscribe()

    m.has(source, subs)
  }))

  it('delays unsubscribing from a connectable observable by the specified interval', marbles(m => {
    m.bind()

    const source = m.hot('-a-b-c')
    const subs   =       '^------!'

    const delayed = source.publish().pipe(delayedRefCount(20))
    delayed.take(1).subscribe()
    delayed.take(3).subscribe()

    m.has(source, subs)
  }))

  it('resets the delay when the ovservable is subscribed to again', marbles(m => {
    m.bind()

    const source = m.hot('-a-b-c')
    const subs   =       '^------!'

    const delayed = source.publish().pipe(delayedRefCount(20))

    delayed.take(1).subscribe()

    timer(20).mergeMap(() =>
      delayed.take(2)
    ).subscribe()

    m.has(source, subs)
  }))

  it('delays unsubscribing when subscribed to more than once', marbles(m => {
    m.bind()

    const source = m.hot('-a-b-c-d')
    const sub1   =       '^-!'
    const sub2   =       '   ^--!'

    const delayed = source.publish().pipe(delayedRefCount(10))

    delayed.take(1).subscribe()

    timer(30).mergeMap(() =>
      delayed.take(2)
    ).subscribe()

    m.has(source, [sub1, sub2])
  }))

  it('unsubscribes immediately if the source completes', marbles(m => {
    m.bind()

    const source = m.cold('-a-b-|')
    const subs   =        '^----!'

    const delayed = source.publish().pipe(delayedRefCount(100))
    delayed.take(2).subscribe()

    m.has(source, subs)
  }))

})
