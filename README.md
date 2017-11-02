# Interlinked

Rx-enabled peer-to-peer RPC for JavaScript.

## Usage

Supply an input Observable, an output Subject, and a plain object as the interface you want to expose to connected peers.

```javascript
const api = {
  numbers: Observable.interval(1000).take(10),
  hello: () => 'interlinked'
}

interlinked(input, output, api)
```

On a connected peer, Observables on the remote API can be used like they are local. Functions always return a promise that resolve once received from the remote.

```javascript
interlinked(input, output).subscribe(async remote => {
  remote.numbers.subscribe(console.log)  // 0... 1... 2... 3...
  console.log(await remote.hello())      // interlinked
})
```

Above, only one side exposes an API, but Interlinked is peer-to-peer - both sides can expose an interface of functions and observables.

### Errors

Errors from the remote observables or promises caught and sent to the calling peer. Observables will complete with an error, and promises from function calls will be rejected.

### Functions that return an Observable

Remote functions may return an Observable.

```javascript
interlinked(input, output, {
  countTo: n => Observable.interval(1000).take(n).map(x => x + 1)
})
```

On a connected peer, the function's promise will resolve to an Observable.

```javascript
interlinked(input, output).subscribe(async remote => {
  const obs = await remote.countTo(3)
  obs.subscribe(console.log) // 1... 2... 3
})
```

## Installation

```
yarn add interlinked
```

or

```
npm install iS interlinked
```

## Full Example

See the `example` directory for a working example of an express server and a browser connected via websocket.

# TODO

  * Timeouts
  * More documentation

## Protocol

Interlinked's wire protocol is loosely based on [JSON-RPC](http://www.jsonrpc.org), but is not a strict superset.

[Protocol description coming soon.]
