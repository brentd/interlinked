import { Observable } from 'rxjs'
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

    const source = m.cold('-a-b-c')
    const subs   =        '^------!'

    const delayed = source.publish().pipe(delayedRefCount(20))
    delayed.take(1).subscribe()
    delayed.take(3).subscribe()

    m.has(source, subs)
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
