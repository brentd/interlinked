import { Observable, Subject } from 'rxjs'
import { map, take } from 'rxjs/operators'
import { WebSocketSubject } from 'rxjs/websocket'
import interlinked from '../lib'

// RxJS's WebSocketSubject acts as both input and output for a websocket
// connection, and by default JSON-serializes data.
const socket = new WebSocketSubject('ws://localhost:3004/ws')

const link = interlinked()

socket.pipe(link(socket)).subscribe(remote => {
  remote.hello().then(x => console.log(x))

  remote.numbers.pipe(take(20)).subscribe(x => console.log(x))

  remote.alpha.subscribe(x => console.log(x))
})
