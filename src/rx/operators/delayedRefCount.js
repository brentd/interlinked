import { Observable, asyncScheduler } from 'rxjs'
import { tap, publish } from 'rxjs/operators'

// Like `refCount()`, but delays unsubscribing from the underlying connectable
// observable until the specified delay.
export function delayedRefCount(delay = 0, scheduler = asyncScheduler) {
  return source => {
    let connection, unsubscriber
    let isComplete = false
    let refCount = 0

    return new Observable(observer => {
      if (isComplete) return

      unsubscriber && unsubscriber.unsubscribe()
      refCount++

      const subscription = source.pipe(
        tap({ complete: () => isComplete = true })
      ).subscribe(observer).add(() => {
        if (--refCount === 0)
          unsubscriber = scheduler.schedule(() => connection.unsubscribe(), delay)
      })

      connection = source.connect()

      return subscription
    })
  }
}

export function shareWithDelayedClose(delay = 0, scheduler = async) {
  return source => source.pipe(
    publish(),
    delayedRefCount(delay, scheduler)
  )
}
