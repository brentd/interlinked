import rx from 'rxjs'

rx.Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

const demux = (muxedStream, key) => {
  return muxedStream.filter(x => x[0] === key).map(x => x[1])
}

const mux = key => x => [key, x]

let subscriptionId = 0

const remoteToLocal = (input, mainOut, registers, completes) => remote => {
  return Object.entries(remote).reduce((local, [k, v]) => {
    if (v.type === 'observable') {
      const proxy = rx.Observable.create(observer => {
        const id = subscriptionId++
        const complete = completes.filter(x => x === id)
        const sub = demux(input, id).takeUntil(complete).subscribe(observer)
        mainOut.next({subscribe: k, id})
        return () => {
          sub.unsubscribe()
          mainOut.next({unsubscribe: id})
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
  const main = {
    in: demux(input, '@').share(),
    out: new rx.Subject()
  }
  main.out.map(mux('@')).subscribe(output)

  if (api && Object.keys(api).length > 0)
    main.out.next({register: localToRemote(api)})

  const registers = main.in
    .filter(x => x.register)
    .pluck('register')

  const subscribes = main.in
    .filter(x => x.subscribe)
    .map(({subscribe, id}) => [subscribe, id])

  const unsubscribes = main.in
    .filter(x => x.unsubscribe != undefined)
    .pluck('unsubscribe')

  const completes = main.in
    .filter(x => x.complete)
    .pluck('complete')

  // const methods = main
  //   .filter(x => x.method)
  //   .map(({method, id}))

  subscribes
    .map(([name, id]) =>
      api[name]
        .takeUntil(unsubscribes.filter(x => x === id))
        .subscribe(
          x   => output.next(mux(id)(x)),
          err => main.out.next({error: id}),
          ()  => main.out.next({complete: id})
        )
    )
    .subscribe()

  return registers.map(remoteToLocal(input, main.out, registers, completes))
}
