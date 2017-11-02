import rx from 'rxjs'
import interlinked from '../lib'

const ws = new WebSocket('ws://localhost:3004/ws')

ws.addEventListener('open', () => {
  const input = rx.Observable.fromEvent(ws, 'message')
    .map(e => JSON.parse(e.data))

  const output = new rx.Subject()
  output.map(JSON.stringify).subscribe(x => ws.send(x))

  interlinked(input, output, {}).subscribe(remote => {
    remote.numbers.subscribe(console.log)
    remote.alpha.subscribe(console.log)
  })
})

ws.addEventListener('close', () => {
  setTimeout(() => location.reload(), 1000)
})
