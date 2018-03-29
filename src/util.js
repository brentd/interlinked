export const hasProperty = prop => x => x[prop] !== undefined
export const hasId       = id   => x => x.id === id

let txId = 0
export const nextTxId = () => txId++
export const resetTxId = () => txId = 0
