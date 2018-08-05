import { Subject } from 'rxjs'

export class QueueingSubject extends Subject {
  _queue = []

  next(value) {
    this.closed || this.observers.length
      ? super.next(value)
      : this._queue.push(value)
  }

  _subscribe(subscriber) {
    const subscription = super._subscribe(subscriber)
    if (this._queue.length) {
      this._queue.forEach(x => super.next(x))
      this._queue = []
    }
    return subscription
  }
}
