import express from 'express'
import webpackMiddleware from 'webpack-dev-middleware'
import WebSocket from 'ws'
import http from 'http'
import webpack from 'webpack'
import path from 'path'

import { Observable, Subject } from 'rxjs'
import interlinked from '../lib'

var app = express()

Observable.prototype.log = function(msg) {
  return this.do(x => console.log(msg, x))
}

app.use(webpackMiddleware(
  webpack(require('./webpack.config')), {noInfo: true}
))

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const input = Observable.fromEvent(ws, 'message')
    .pluck('data')
    .map(JSON.parse)

  ws.on('error', e => console.log('who cares', e))

  const output = new Subject().map(JSON.stringify).log('->')

  .subscribe(x => ws.send(x))

  const subject = Subject.create(output, messages)

  const api = {
    numbers: Observable.interval(1000).take(4),
    alpha: Observable.interval(500).zip(Observable.of('a', 'b', 'c', 'd')).map(x => x[1])
  }

  interlinked(subject, api).subscribe()
})

server.listen(3004, () =>
  console.log('Listening: http://localhost:%d', server.address().port)
)
