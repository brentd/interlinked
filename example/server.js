const http = require('http')
const path = require('path')
const express = require('express')
const WebSocket = require('ws')
const Bundler = require('parcel-bundler')

const { Subject, fromEvent, interval, of } = require('rxjs')
const { map, zip, catchError } = require('rxjs/operators')
const interlinked = require('../lib').default

var app = express()

const bundler = new Bundler(path.join(__dirname, 'index.html'))
app.use(bundler.middleware())

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/ws' })

// This is the API we'll expose to connected websockets.
const api = {
  hello: () => 'hello world',

  numbers: interval(1000),

  alpha: interval(500).pipe(
    zip(of('a', 'b', 'c', 'd')),
    map(x => x[1])
  )
}

wss.on('connection', (ws, req) => {
  ws.on('error', console.error)

  const input = fromEvent(ws, 'message').pipe(
    map(x => JSON.parse(x.data))
  )

  const output = new Subject().pipe(
    map(JSON.stringify)
  )

  output.subscribe(x => ws.readyState === WebSocket.OPEN && ws.send(x))

  const link = interlinked(api)

  // We don't expect the other side to publish an API, so we just subscribe.
  input.pipe(link(output)).subscribe()
})

server.listen(3004, () =>
  console.log('Listening: http://localhost:%d', server.address().port)
)
