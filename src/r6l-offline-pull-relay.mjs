/* R6L: OFFLINE-only pull relay over a PRIVATE IN-MEMORY fake source.
 * Absolutely no Docker/socket/HTTP adapters or process/file operations.
 * Separately approved real transport would need a DIFFERENT, reviewed API.
 */
import { createR6KDecoder } from './r6k-bounded-docker-frame-decoder.mjs';

const MAX_CHUNKS = 512;
const MAX_TOTAL_BYTES = 65536;
const MAX_CHUNK_BYTES = 2048;
const blocked = category => new Error('R6L_BLOCKED_' + category);
const isPositiveInt = x => Number.isSafeInteger(x) && x >= 1;

/** Owned, one-shot fake source. Never delegates to a caller-supplied iterator. */
export class OfflineR6LChunks {
  #buffers;
  #started = false;
  #closed = false;
  #pulled = 0;
  #failOnPull;
  constructor(chunks, { failOnPull = null } = {}) {
    if (!Array.isArray(chunks) || chunks.length > MAX_CHUNKS ||
        (failOnPull !== null && (!isPositiveInt(failOnPull) || failOnPull > chunks.length))) {
      throw blocked('SOURCE_SCOPE');
    }
    let total = 0;
    const copies = [];
    for (const chunk of chunks) {
      if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > MAX_CHUNK_BYTES) {
        throw blocked('SOURCE_CHUNK');
      }
      total += chunk.length;
      if (total > MAX_TOTAL_BYTES) throw blocked('SOURCE_BYTES');
      copies.push(Buffer.from(chunk));
    }
    this.#buffers = copies;
    this.#failOnPull = failOnPull;
    Object.freeze(this);
  }
  static isOffline(value) {
    return value instanceof OfflineR6LChunks &&
      Object.getPrototypeOf(value) === OfflineR6LChunks.prototype && #buffers in value;
  }
  close() { this.#destroy(); }
  status() {
    return Object.freeze({ started:this.#started, closed:this.#closed,
      pulled:this.#pulled, remaining:this.#buffers.filter(Boolean).length });
  }
  #destroy() {
    if (this.#closed) return;
    this.#closed = true;
    for (const chunk of this.#buffers) if (chunk) chunk.fill(0);
    this.#buffers = [];
  }
  [Symbol.asyncIterator]() {
    if (this.#started) throw blocked('SOURCE_REUSED');
    this.#started = true;
    let index = 0;
    return Object.freeze({
      next: async () => {
        if (this.#closed) return {done:true,value:undefined};
        if (index >= this.#buffers.length) {
          this.#destroy();
          return {done:true,value:undefined};
        }
        this.#pulled++;
        if (this.#pulled === this.#failOnPull) {
          this.#destroy();
          throw new Error('UPSTREAM_SECRET_CANARY_NEVER_EXPOSE');
        }
        const stored = this.#buffers[index];
        const copy = Buffer.from(stored);
        stored.fill(0);
        this.#buffers[index] = null;
        index++;
        return {done:false,value:copy};
      },
      return: async () => {
        this.#destroy();
        return {done:true,value:undefined};
      }
    });
  }
}

/** No prefetched reads: no next() call while the consumer holds a safe frame.
 * Abort/deadline checks are cooperative between pulls; cannot interrupt a
 * blocked external transport (and external transports are explicitly refused).
 */
export async function* relayR6LOffline(source, {
  signal=null, maxChunks=MAX_CHUNKS, maxElapsedMs=10000,
  clock=()=>performance.now()
}={}) {
  if (!OfflineR6LChunks.isOffline(source) || !isPositiveInt(maxChunks) ||
      maxChunks > MAX_CHUNKS || !isPositiveInt(maxElapsedMs) || maxElapsedMs > 30000 ||
      typeof clock !== 'function' ||
      (signal !== null && typeof signal?.aborted !== 'boolean')) {
    throw blocked('RELAY_SCOPE');
  }
  const decoder=createR6KDecoder();
  let iterator;
  let count=0;
  let started;
  try {
    const check = () => {
      if (signal?.aborted) throw blocked('CANCELLED');
      let time;
      try { time=clock(); } catch { throw blocked('CLOCK'); }
      if (!Number.isFinite(time)) throw blocked('CLOCK');
      if (started === undefined) started = time;
      if (time < started || time-started > maxElapsedMs) throw blocked('DEADLINE');
    };
    check();
    iterator=source[Symbol.asyncIterator]();
    while(true) {
      check();
      let step;
      try { step=await iterator.next(); } catch { throw blocked('SOURCE_FAILURE'); }
      check();
      if (!step || typeof step.done!=='boolean') throw blocked('SOURCE_PROTOCOL');
      if (step.done) break;
      count++;
      if (count>maxChunks) throw blocked('CHUNK_COUNT');
      try { decoder.push(step.value); } catch { throw blocked('FRAME_OR_SIZE'); }
      while(decoder.status().pendingFrames > 0) {
        check();
        let frame;
        try { frame=decoder.take(1)[0]; } catch { throw blocked('FRAME_OR_SIZE'); }
        yield frame;
      }
    }
    check();
    try { decoder.finish(); } catch { throw blocked('TRUNCATED_OR_FRAME'); }
    while(decoder.status().pendingFrames > 0) {
      check();
      yield decoder.take(1)[0];
    }
  } finally {
    if (OfflineR6LChunks.isOffline(source)) source.close();
    if (decoder.status().state==='ACTIVE') decoder.cancel();
    if (iterator && typeof iterator.return==='function') {
      try { await iterator.return(); } catch { throw blocked('SOURCE_CLOSE'); }
    }
  }
}
