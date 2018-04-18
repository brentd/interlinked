import { Observable } from 'rxjs/Observable'
import { Subject } from 'rxjs/Subject'
import async from 'rxjs/scheduler/async'

import { timer } from 'rxjs/observable/timer'
import { never } from 'rxjs/observable/never'

import "rxjs/add/operator/scan"
import "rxjs/add/operator/filter"
import "rxjs/add/operator/switchMap"

// Like `refCount()`, but delays unsubscribing from the underlying connectable
// observable until the specified delay.
export function delayedRefCount(delay = 0, scheduler = async) {
  return source => {
    let subscription
    const count$ = new Subject()

    count$
      .scan((total, n) => total + n, 0)
      .switchMap(total => total === 0 ? timer(delay, scheduler) : never())
      .subscribe(() => subscription && subscription.unsubscribe())

    return new Observable(observer => {
      source.subscribe(observer)
      subscription = source.connect()

      count$.next(1)
      return () => count$.next(-1)
    })
  }
}
