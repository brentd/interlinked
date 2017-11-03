# Interlinked

Rx-enabled peer-to-peer RPC for JavaScript.

No dependencies other than [RxJS](https://github.com/reactivex/rxjs). Use any transport and serialization you like.

## Installation

```
yarn add interlinked
```

or

```
npm install -S interlinked
```

## Usage

Interlinked's API is a single function that returns an Observable.

```javascript
import interlinked from 'interlinked'

const api = {
  numbers: Observable.interval(1000).take(10),
  hello: () => 'interlinked'
}

someTransport.on('connection', (socket, req) => {
  const input  = Observable.fromEvent(socket, 'message').map(JSON.parse)
  const output = x => socket.send(JSON.stringify(x))

  interlinked(input, output, api)
})
```

Then, on a connected peer:

  * Use remote observables like they are local.
  * Functions always return a promise that resolve once the remote function has a return value.

```javascript
// On some other process, or machine...

interlinked(input, output).subscribe(async remote => {
  remote.numbers.subscribe(console.log)
  // 0... 1... 2... 3...
  console.log(await remote.hello())
  // interlinked
})
```

Here, only one side exposes an API. However, Interlinked is peer-to-peer: both sides can expose an interface of functions and observables.

### API

```javascript
interlinked(input: Observable, output: Function|Subject, api: Object): Observable
```

|Param|Type||Description|
|---|---|---|---|
| `input` | `Observable` | required | A deserialized input stream from your transport. |
| `output` | `Function\|Subject` | required | Either a function that accepts one argument and sends it through your transport, or a Subject that you've subscribed to and piped into your transport. |
| `api` | `Object` | optional | A plain object containing observables and functions that you want to expose to the connected peer. This object may be nested to help organize the API. |

Returns an Observable that emits the remote interface when available.

### Errors

Errors from the remote observables or promises are caught and sent to the calling peer. Observables will complete with an error, and promises will be rejected, as you'd expect.

### Functions that return an Observable

Remote functions may return an observable.

```javascript
interlinked(input, output, {
  countTo: n => Observable.interval(1000).take(n).map(x => x + 1)
})
```

On a connected peer, the function's promise will resolve to an observable that can be subscribed to as if it were local.

```javascript
interlinked(input, output).subscribe(async remote => {
  const obs = await remote.countTo(3)
  obs.subscribe(console.log)
  // 1... 2... 3
})
```

**Note:** since the remote can't know when a peer will subscribe to a returned observable, all returned observables are held in memory until the peer disconnects (or when the `input` observable otherwise completes). Use with care.

## Full Example

See the [example directory](example/) for a working sample of an express server and a browser connected via websocket.

## Protocol

Interlinked's protocol is loosely based on [JSON-RPC](http://www.jsonrpc.org). It is not a strict superset.

[Protocol description coming soon.]

## TODO

  * Timeouts
  * More documentation
  * Allow observable constructors other than RxJS 5?
  * Optionally surface errors on the remote also (middleware?)
