# Interlinked

[![NPM version](https://img.shields.io/npm/v/interlinked.svg)](https://www.npmjs.com/package/interlinked)

Rx-enabled peer-to-peer RPC for JavaScript. It can expose an API of functions and streams to other JavaScript peers.

No dependencies other than [RxJS 6](https://github.com/reactivex/rxjs). Use any transport and serialization you like.

**⚠️ This is alpha software and may be a terrible idea. The API is subject to change. ⚠️**

## Installation

```
npm install -S interlinked
```

## Usage

```javascript
import interlinked from 'interlinked'

const transportIn  = // an observable of input from a connected peer
const transportOut = // an observer (object that implements `next()`) that outputs to the connected peer

// The API to expose to peers.
const api = {
  baseline: () => 'within cells interlinked'
}

const link = interlinked(api)

transportIn.pipe(link(transportOut)).subscribe()
```

Then, on a connected peer:

```javascript
import interlinked from 'interlinked'

// This side does not expose an API.
const link = interlinked()

// Peers can publish their API multiple times, so the source is
// transformed into a stream of remote APIs.
transportIn.pipe(link(transportOut)).subscribe(remote => {
  remote.baseline() // Promise resolve: 'within cells interlinked'
})
```

Here, only one side exposes an API. However, Interlinked is peer-to-peer: both sides can expose an interface of functions and observables.

This is an incomplete example for brevity. For a working client/server implementation, see [the example directory](example/).

### API

```javascript
interlinked(api: Object, middlewares: Object[]) => operator(output: { next: Function }) => Observable<Object>
```

|Param|Type||Description|
|---|---|---|---|
| `api` | `Object` | optional | A plain object containing observables and functions that you want to expose to the connected peer. This object may be nested to help organize the API. |
| `middlewares` | `Array<Object>` | optional | An array of middleware objects. Overrides the default stack; append your middlewares to the default stack if you want to extend it. |
| `output` | `Function` | required | `{ next: (msg: Array\|Object) => void }` <br><br> Any object that responds to `next`. `next` takes one argument and must send the message through your transport to the connected peer. `msg` may be a JavaScript `Object` or `Array` - see [Protocol](#Protocol). You are responsible for serializing for your transport. |

Returns an [RxJS pipeable operator](https://github.com/ReactiveX/rxjs/blob/master/doc/pipeable-operators.md). The operator transforms the input stream into a stream of proxy Objects that mirror the API exposed by the connected peer.

## Supported Types

Interlinked comes with support for three types of objects in the exposed API.

### Functions

Functions simply return promises when called on a connected peer. The return value of the function can be any value supported by your serialization format, since Interlinked leaves serialization up to you.

```javascript
interlinked({
  hello: name => 'hello ' + name
})

// On a connected peer...

remote.hello('Roy') // Promise resolve: 'hello Roy'
```

### Observables

Observables are mirrored exactly when used on a connected peer and can be used as if they were local. Like functions, emitted values can be any type supported by your serialization format.

```javascript
import { of } from 'rxjs'

interlinked({
  counter: of(1, 2, 3)
})

// On a connected peer...

remote.counter.subscribe({
  next: x => console.log(x),
  complete: console.log('Complete')
})

// 1
// 2
// 3
// Complete
```

### Resources

This is a WIP type which allows you to define a REST-like interface for performing CRUD operations on a resource.

```javascript
import { fromEvent } from 'rxjs'
import interlinked, { resource } from 'interlinked'

interlinked({
  replicants: resource({
    // Automatically send updated records every 10 minutes.
    index: () => {
      return interval(10 * 60 * 1000).pipe(map(someApi.getRecords))
    },

    // Maintain a subscription to a specific record's updates.
    get: id => fromEvent(someApi, 'update')

    create: () => {} // WIP
    update: id => {} // WIP
    delete: id => {} // WIP
  })
})

// On a connected peer...

remote.replicants.index() // Observable<Array>
remote.replicants.get(id) // Observable<Object>
```

### Deeply nested properties

The exposed API may have properties of arbitrary depth - the full object tree will be mirrored on the peer's proxy client.

```javascript
interlinked({
  cells: {
    within: {
      cells: {
        interlinked: () => 'interlinked'
      }
    }
  }
})

// On a connected peer...

remote.cells.within.cells.interlinked() // Promise resolve: 'interlinked'
```

### Errors

Errors from remote observables or promises are caught and forwarded to the peer. Observables will complete with an error, and promises will be rejected, as you'd expect.

```javascript
interlinked({
  boom: () => { throw new Error('dreadfully distinct') }
})

// On a connected peer...

remote.boom() // Promise reject: <Error message: 'dreadfully distinct'>
```

## Middlewares

Interlinked's types are implemented as [middlewares](src/middleware). An Interlinked middleware takes the form:

```javascript
function(input, output) {
  return {
    serve(key, value) {
      // 1. setup necessary listeners on `input`
      // 2. return a plain JavaScript object representing the value
    },

    proxy(serializedProperty) {
      // return a proxy object that sends output and listens to input as necessary
    }
  }
}
```

## Protocol

### Publishing the API

A publish message is sent immediately when a peer connects.

```javascript
// Example API
{
  keypath: {
    to: {
      fn: () => {},
      obs: of(1, 2, 3)
    }
  }
}
```

```javascript
// Result
{
  "publish": [
    {
      "key": "keypath.to.fn",
      "type": "function"
    },
    {
      "key": "keypath.to.obs",
      "type": "observable"
    }
  ]
}
```

### Functions

This format follows [JSON-RPC](http://www.jsonrpc.org), but this protocol is not intended to be a superset.

| Operation | | Result |
| --- | --- | --- |
| `remote.path.to.fn('arg')` | → | `{ "id": txId, "method": "path.to.fn", "params": ['arg'] }` |
| Successful response | ← | `{ "id": txId, "result": data }` |
| Error response | ← | `{ "id": txId, "error": { "message": "..." } }` |

`id` is a transaction ID established by the client.

### Observables

| Operation | | Result |
| --- | --- | --- |
| `remote.obs.subscribe()` | → | `[id, "S", "obs"]` |
| New data | ← | `[id, "N", data]` |
| Error | ← | `[id, "E", { message: "..." }]` |
| Complete | ← | `[id, "C"]` |
| Unsubscribe | → | `[id, "U"]` |

`id` is a transaction ID established by the client.

### Resources

TBD
