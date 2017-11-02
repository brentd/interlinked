# Interlinked

Rx-enabled peer-to-peer RPC for JavaScript.

No dependencies other than [RxJS](https://github.com/Reactive-Extensions/RxJS). Use any transport and serialization you like.

## Usage

Supply an input Observable, an output Subject, and a plain object as the interface you want to expose.

```javascript
const api = {
  numbers: Observable.interval(1000).take(10),
  hello: () => 'interlinked'
}

interlinked(input, output, api)
```

On a connected peer:

  * Use remote observables like they are local.
  * Functions always return a promise that resolve once the remote function has a return value.

```javascript
interlinked(input, output).subscribe(async remote => {
  remote.numbers.subscribe(console.log)
  // 0... 1... 2... 3...
  console.log(await remote.hello())
  // interlinked
})
```

Here, only one side exposes an API. However, Interlinked is peer-to-peer: both sides can expose an interface of functions and observables.

### Errors

Errors from the remote observables or promises are caught and sent to the calling peer. Observables will complete with an error, and promises will be rejected, as you'd expect.

### Functions that return an Observable

Remote functions may return an observable.

```javascript
interlinked(input, output, {
  countTo: n => Observable.interval(1000).take(n).map(x => x + 1)
})
```

On a connected peer, the function's promise will resolve to an observable that can be subscribed to like normal.

```javascript
interlinked(input, output).subscribe(async remote => {
  const obs = await remote.countTo(3)
  obs.subscribe(console.log)
  // 1... 2... 3
})
```

## Installation

```
yarn add interlinked
```

or

```
npm install -S interlinked
```

## Full Example

See the `example` directory for a working example of an express server and a browser connected via websocket.

# TODO

  * Timeouts
  * More documentation
  * Allow observable constructors other than RxJS 5?
  * Optionally surface errors on the remote also (middleware?)

## Protocol

Interlinked's protocol is loosely based on [JSON-RPC](http://www.jsonrpc.org). It is not a strict superset.

[Protocol description coming soon.]
