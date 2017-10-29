import rx from 'rxjs'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

const demux = (muxedStream, key) => {
  return muxedStream.filter(x => x[0] === key).map(x => x[1])
}

const mux = key => x => [key, x]

let subscriptionId = 0

const remoteToLocal = (input, output, registers) => remote => {
  return Object.entries(remote).reduce((local, [k, v]) => {
    if (v.type === 'observable') {
      const proxy = rx.Observable.create(observer => {
        const id = subscriptionId++
        const sub = demux(input, id).subscribe(observer)
        output.next(['@', {subscribe: k, id}])
        return () => {
          sub.unsubscribe()
          output.next(['@', {unsubscribe: id}])
        }
      })
      local[k] = proxy.takeUntil(registers)
    } else if (v.type === 'function') {
      local[k] = () => console.log('calling function', k)
    } else {
      local[k] = remoteToLocal(v)
    }
    return local
  }, {})
}

const localToRemote = local => {
  return Object.entries(local).reduce((remote, [k, v]) => {
    if (v.subscribe) {
      remote[k] = {key: k, type: 'observable'}
    } else if (typeof v === 'function') {
      remote[k] = {key: k, type: 'function'}
    } else if (typeof v === 'object' && v !== null) {
      remote[k] = transform(v)
    }
    return remote
  }, {})
}

export default function(input, output, api) {
  const main = demux(input, '@').share()

  output.next(['@', {register: localToRemote(api)}])

  const registers = main
    .filter(x => x.register)
    .pluck('register')

  const unsubscribes = main
    .filter(x => x.unsubscribe != undefined)
    .pluck('unsubscribe')

  const subscribes = main
    .filter(x => x.subscribe)
    .map(({subscribe, id}) => [subscribe, id])

  // const methods = main
  //   .filter(x => x.method)
  //   .map(({method, id}))

  subscribes
    .mergeMap(([name, id]) =>
      api[name]
        .takeUntil(unsubscribes.filter(x => x == id))
        .map(mux(id))
    )
    .subscribe(output)

  return registers.map(remoteToLocal(input, output, registers))
}
