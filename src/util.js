import { tap } from 'rxjs/operators'

export const hasProperty = prop => x => x.hasOwnProperty('result')
export const hasId       = id   => x => x.id === id

let txId = 0
export const nextTxId = () => txId++
export const resetTxId = () => txId = 0

export function throwRemoteErrors(txId) {
  return source => source.pipe(
    tap({
      next: ({ id, error }) => { if (id === txId && error) throw new RemoteError(error.message) }
    })
  )
}

export function throwOnDisconnect(name) {
  return source => source.pipe(
    tap({
      complete: () => { throw new RemoteDisconnectedError(`The remote disconnected before ${name} completed`) }
    })
  )
}

export class RemoteDisconnectedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RemoteDisconnectedError'
  }
}

export class RemoteError extends Error {
  constructor(message) {
    super(message)
    this.name = 'RemoteError'
  }
}
