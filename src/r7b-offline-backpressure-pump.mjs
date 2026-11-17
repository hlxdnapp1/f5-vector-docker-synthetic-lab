/* R7B-G1B2: owned in-memory Node Writable backpressure laboratory.
 * Does NOT open sockets, connect to Docker, authenticate TLS or process real logs.
 * Input is limited to public synthetic fixtures accepted by the pinned R7B parser.
 */
import { Writable } from 'node:stream';
import { createR7BSyntheticStream } from './r7b-bounded-synthetic-stream.mjs';

const MAX_BYTES = 65536;
const MAX_CHUNKS = 512;
const MAX_CHUNK = 2048;
const fail = code => { throw Error('R7B_PUMP_BLOCKED_' + code); };

/** Branded, one-use in-memory source; never accepts network async iterators. */
export class R7BOfflineSource {
  #chunks; #kind; #pulled = 0; #closed = false; #started = false;
  constructor(kind, chunks) {
    if (!['EVENTS', 'LOGS'].includes(kind) || !Array.isArray(chunks) ||
        chunks.length < 1 || chunks.length > MAX_CHUNKS) fail('SOURCE_SCOPE');
    let bytes = 0;
    this.#chunks = chunks.map(chunk => {
      if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > MAX_CHUNK ||
          (bytes += chunk.length) > MAX_BYTES) fail('SOURCE_CHUNK');
      return Buffer.from(chunk);
    });
    this.#kind = kind;
  }
  static owns(source) {
    return source instanceof R7BOfflineSource &&
      Object.getPrototypeOf(source) === R7BOfflineSource.prototype && #chunks in source;
  }
  get kind() { return this.#kind; }
  status() { return Object.freeze({pulled: this.#pulled, started: this.#started, closed: this.#closed}); }
  pull() {
    if (this.#closed) fail('SOURCE_CLOSED');
    if (!this.#started) this.#started = true;
    if (this.#chunks.length === 0) return null;
    this.#pulled++;
    const stored = this.#chunks.shift();
    const chunk = Buffer.from(stored);
    stored.fill(0);
    return chunk;
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const chunk of this.#chunks) chunk.fill(0);
    this.#chunks = [];
  }
}

/** Owned Node Writable that can deliberately hold _write callbacks for drain tests. */
export class R7BOfflineSink extends Writable {
  #parts = []; #bytes = 0; #held = false; #pendingCallback = null;
  constructor() { super({highWaterMark: 1, autoDestroy: false}); }
  static owns(sink) {
    return sink instanceof R7BOfflineSink &&
      Object.getPrototypeOf(sink) === R7BOfflineSink.prototype && #parts in sink;
  }
  hold() { if (this.writableEnded || this.destroyed) fail('SINK_CLOSED'); this.#held = true; }
  release() {
    this.#held = false;
    const callback = this.#pendingCallback;
    this.#pendingCallback = null;
    if (callback) queueMicrotask(callback);
  }
  _write(chunk, encoding, callback) {
    if (this.#bytes + chunk.length > MAX_BYTES) return callback(Error('R7B_PUMP_BLOCKED_SINK_LIMIT'));
    this.#parts.push(Buffer.from(chunk));
    this.#bytes += chunk.length;
    if (this.#held) this.#pendingCallback = callback;
    else queueMicrotask(callback);
  }
  _destroy(error, callback) {
    for (const chunk of this.#parts) chunk.fill(0);
    this.#parts = [];
    this.#bytes = 0;
    const pending = this.#pendingCallback;
    this.#pendingCallback = null;
    if (pending) queueMicrotask(() => pending(Error('R7B_PUMP_BLOCKED_SINK_DESTROYED')));
    callback(error);
  }
  bytes() {
    if (!this.writableFinished || this.destroyed) fail('SINK_NOT_FINISHED');
    return Buffer.concat(this.#parts);
  }
  status() { return Object.freeze({bytes: this.#bytes, held: this.#held,
    finished: this.writableFinished, destroyed: this.destroyed}); }
}

function waitFor(sink, eventName, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const cleanup = () => {
      sink.off(eventName, success);
      sink.off('error', error);
      sink.off('close', closed);
      signal?.removeEventListener('abort', aborted);
      clearTimeout(timer);
    };
    const finish = reason => {
      if (done) return;
      done = true; cleanup();
      if (reason) reject(Error('R7B_PUMP_BLOCKED_' + reason));
      else resolve();
    };
    const success = () => finish(null);
    const error = () => finish('SINK_ERROR');
    const closed = () => finish('SINK_CLOSED');
    const aborted = () => finish('ABORTED');
    const timer = setTimeout(() => finish('DRAIN_TIMEOUT'), timeoutMs);
    sink.once(eventName, success);
    sink.once('error', error);
    sink.once('close', closed);
    signal?.addEventListener('abort', aborted, {once: true});
    if (signal?.aborted) finish('ABORTED');
    else if (sink.destroyed) finish('SINK_CLOSED');
    else if (eventName === 'finish' && sink.writableFinished) finish(null);
  });
}

/** Do not pass untrusted network streams; only the two owned in-memory classes. */
export async function pumpR7BOffline(source, sink, {
  signal = null, drainTimeoutMs = 1000, deadlineMs = 10000
} = {}) {
  if (!R7BOfflineSource.owns(source) || !R7BOfflineSink.owns(sink) ||
      source.status().started || source.status().closed ||
      sink.writableEnded || sink.destroyed ||
      (signal !== null && typeof signal?.aborted !== 'boolean') ||
      !Number.isSafeInteger(drainTimeoutMs) || drainTimeoutMs < 1 || drainTimeoutMs > 10000 ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000) fail('SCOPE');
  const parser = createR7BSyntheticStream(source.kind);
  const start = performance.now();
  let frames = 0, bytes = 0;
  const check = () => {
    if (signal?.aborted) fail('ABORTED');
    if (sink.destroyed || sink.writableEnded) fail('SINK_CLOSED');
    if (performance.now() - start > deadlineMs) fail('DEADLINE');
  };
  try {
    while (true) {
      check();
      const input = source.pull();
      if (input === null) break;
      try { parser.push(input); }
      finally { input.fill(0); }
      const outputs = parser.take();
      try {
        for (const output of outputs) {
          check();
          bytes += output.length;
          frames++;
          if (bytes > MAX_BYTES || frames > 100) fail('OUTPUT_LIMIT');
          // At highWaterMark=1, every write() returns false; wait for drain
          // BEFORE pulling another input chunk or sending the next output.
          const ready = sink.write(output);
          if (!ready) await waitFor(sink, 'drain', signal,
            Math.max(1, Math.min(drainTimeoutMs, deadlineMs - (performance.now() - start))));
        }
      } finally {
        // Cancel/timeout can occur after take() but before every frame is written.
        for (const output of outputs) output.fill(0);
      }
    }
    parser.finish();
    check();
    sink.end();
    if (!sink.writableFinished) await waitFor(sink, 'finish', signal,
      Math.max(1, Math.min(drainTimeoutMs, deadlineMs - (performance.now() - start))));
    return Object.freeze({ok: true, kind: source.kind, frames, bytes});
  } catch {
    if (parser.status().state === 'ACTIVE') parser.cancel();
    // This sink never exposes partial output before successful finish.
    sink.destroy();
    fail('STREAM_ABORTED');
  } finally { source.close(); }
}
