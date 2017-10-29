import express from 'express'
import webpackMiddleware from 'webpack-dev-middleware'
import WebSocket from 'ws'
import http from 'http'
import webpack from 'webpack'
import path from 'path'

import rx from 'rxjs'
import rprx from '../index.js'

var app = express()

app.use(webpackMiddleware(
  webpack(require('./webpack.config')), {noInfo: true}
))

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ server, path: '/ws' })

wss.on('connection', (ws, req) => {
  const messages = rx.Observable.create(observer => {
    ws.on('message', msg => observer.next(msg))
  }).map(JSON.parse).log('<-')

  const output = new rx.Subject()
  output.map(JSON.stringify).log('->').subscribe(x => ws.send(x))

  const quotes = rx.Observable.interval(1000).take(4)
  const positions = rx.Observable.interval(2000).take(2).map(x => x + 100)

  rprx(messages, output, { quotes, positions })
})

server.listen(3004, () =>
  console.log('Listening: http://localhost:%d', server.address().port)
)
