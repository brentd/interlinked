import { Observable } from 'rxjs/Observable'
import { Subject } from 'rxjs/Subject'
import async from 'rxjs/scheduler/async'

import { timer } from 'rxjs/observable/timer'
import { never } from 'rxjs/observable/never'

// Like `refCount()`, but delays unsubscribing from the underlying connectable
// observable until the specified delay.
export function delayedRefCount(delay = 0, scheduler = async) {
  return source => {
    const count$ = new Subject()
    let subscription

    count$
      .scan((total, n) => total + n, 0)
      .switchMap(total => total === 0 ? timer(delay, scheduler) : never())
      .subscribe(() => {
        if (subscription) subscription.unsubscribe()
        count$.complete()
      })

    return new Observable(observer => {
      source.subscribe(observer)
      let old = subscription
      subscription = source.connect()

      count$.next(1)
      return () => count$.next(-1)
    })
  }
}
