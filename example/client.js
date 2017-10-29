import rx from 'rxjs'
import rprx from '../index'

const ws = new WebSocket('ws://localhost:3004/ws')

ws.addEventListener('open', () => {
  const input = rx.Observable.fromEvent(ws, 'message')
    .map(e => JSON.parse(e.data))
  const output = new rx.Subject()
  output.map(JSON.stringify).log('->').subscribe(x => ws.send(x))

  rprx(input, output, {}).subscribe(remote => {
    remote.positions.subscribe(console.log)
    remote.quotes.subscribe(console.log)
    setTimeout(() => {
      remote.quotes.subscribe(console.log)
    }, 2500)
  })
})


ws.addEventListener('close', () => {
  setTimeout(() => location.reload(), 1000)
})
