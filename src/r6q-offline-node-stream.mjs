/* R6Q DRAFT: offline-only, bounded synthetic stream parser + Node Writable backpressure.
 * No Node network imports, no Docker transport, no external iterators, no files.
 * Synthetic frames only. NOT a live Vector gateway or a Docker source.
 */
import { Writable } from 'node:stream';

const ALIAS = 'a'.repeat(64);
const MARKER = 'R6F_PUBLIC_SYNTHETIC_ONLY';
const NAME = /^r6g-synthetic-[a-f0-9]{8}$/;
const TIME = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z) R6F_PUBLIC_SYNTHETIC_ONLY\n$/;
const ACTIONS = new Set(['start', 'die', 'pause', 'unpause']);
const kinds = new Set(['EVENTS', 'LOGS']);
const fail = code => { throw Error('R6Q_BLOCKED_' + code); };
const exact = (value, names) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(k => Object.hasOwn(value,k));
const utf8 = new TextDecoder('utf-8', { fatal: true });
const MAX_BYTES = 65536;
const MAX_CHUNKS = 512;
const MAX_PENDING = 4096;
const MAX_RECORD = 1024;
const MAX_FRAMES = 100;

export class R6QOfflineChunks {
  #chunks; #kind; #started = false; #closed = false; #pulled = 0; #failOnPull;
  constructor(kind, chunks, {failOnPull = null} = {}) {
    if (!kinds.has(kind) || !Array.isArray(chunks) || chunks.length === 0 ||
      chunks.length > MAX_CHUNKS || (failOnPull !== null &&
      (!Number.isSafeInteger(failOnPull) || failOnPull < 1 || failOnPull > chunks.length))) fail('SOURCE_SCOPE');
    let count = 0;
    this.#chunks = chunks.map(chunk => {
      if (!Buffer.isBuffer(chunk) || chunk.length < 1 || chunk.length > 2048 ||
        (count += chunk.length) > MAX_BYTES) fail('SOURCE_CHUNK');
      return Buffer.from(chunk);
    });
    this.#kind = kind;
    this.#failOnPull = failOnPull;
  }
  static isOffline(v) { return v instanceof R6QOfflineChunks &&
    Object.getPrototypeOf(v) === R6QOfflineChunks.prototype && #chunks in v; }
  get kind() { return this.#kind; }
  status() { return Object.freeze({pulled:this.#pulled,closed:this.#closed,started:this.#started}); }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const b of this.#chunks) if (b) b.fill(0);
    this.#chunks = [];
  }
  [Symbol.asyncIterator]() {
    if (this.#started || this.#closed) fail('SOURCE_REUSED');
    this.#started = true;
    let index = 0;
    return Object.freeze({
      next: async () => {
        if (this.#closed) return {done:true};
        if (index === this.#chunks.length) { this.close(); return {done:true}; }
        this.#pulled++;
        if (this.#pulled === this.#failOnPull) { this.close(); fail('SOURCE_FAILURE'); }
        const b = this.#chunks[index];
        const copy = Buffer.from(b); b.fill(0); this.#chunks[index++] = null;
        return {done:false,value:copy};
      },
      return: async () => { this.close(); return {done:true}; }
    });
  }
}

/* Writable with genuinely asynchronous _write acknowledgements but memory only.
 * Its held callback forces write() backpressure at highWaterMark=1.
 */
export class R6QOfflineSink extends Writable {
  #parts = []; #used = 0; #hold = false; #pending = null;
  constructor() { super({highWaterMark:1,autoDestroy:true}); }
  static isOffline(v) { return v instanceof R6QOfflineSink &&
    Object.getPrototypeOf(v) === R6QOfflineSink.prototype && #parts in v; }
  hold() { if (this.destroyed || this.writableEnded) fail('SINK_CLOSED'); this.#hold = true; }
  release() { this.#hold = false; const cb = this.#pending; this.#pending = null; if (cb) queueMicrotask(cb); }
  _write(chunk, encoding, cb) {
    if (this.#used + chunk.length > MAX_BYTES) { cb(Error('R6Q_BLOCKED_SINK_LIMIT')); return; }
    this.#parts.push(Buffer.from(chunk)); this.#used += chunk.length;
    if (this.#hold) this.#pending = cb;
    else queueMicrotask(cb);
  }
  _destroy(error, cb) {
    const pending = this.#pending; this.#pending = null;
    if (pending) queueMicrotask(() => pending(Error('R6Q_BLOCKED_SINK_CLOSED')));
    cb(error);
  }
  bytes() { return Buffer.concat(this.#parts); }
  status() { return Object.freeze({acceptedBytes:this.#used,parts:this.#parts.length,
    held:this.#hold,closed:this.destroyed}); }
}

const eventBytes = bytes => {
  if (bytes.length > MAX_RECORD) fail('EVENT_LENGTH');
  let e;
  try { e = JSON.parse(utf8.decode(bytes)); } catch { fail('EVENT_JSON'); }
  if (!exact(e,['Type','Action','Actor','time']) || e.Type !== 'container' ||
      !ACTIONS.has(e.Action) || !exact(e.Actor,['ID','Attributes']) ||
      e.Actor.ID !== ALIAS || !exact(e.Actor.Attributes,['name']) ||
      !NAME.test(e.Actor.Attributes.name) || !Number.isSafeInteger(e.time) || e.time < 1) fail('EVENT_PROOF');
  return Buffer.from(JSON.stringify({Type:'container',Action:e.Action,
    Actor:{ID:ALIAS,Attributes:{name:e.Actor.Attributes.name}},time:e.time}) + '\n');
};
const logBytes = bytes => {
  if (bytes.length < 9 || bytes.length > 520 || ![1,2].includes(bytes[0]) ||
      bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 0 ||
      bytes.readUInt32BE(4) !== bytes.length - 8) fail('LOG_FRAME');
  let line;
  try { line = utf8.decode(bytes.subarray(8)); } catch { fail('LOG_UTF8'); }
  const m = TIME.exec(line);
  const t = m ? Date.parse(m[1]) : NaN;
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0,19) !== m[1].slice(0,19)) fail('LOG_CONTENT');
  const body = Buffer.from(m[1] + ' ' + MARKER + '\n');
  const h = Buffer.alloc(8); h[0] = bytes[0]; h.writeUInt32BE(body.length,4);
  return Buffer.concat([h,body]);
};
function parseChunk(kind,carry,incoming) {
  if (!Buffer.isBuffer(incoming) || incoming.length < 1 || incoming.length > 2048 ||
      carry.length + incoming.length > MAX_PENDING) fail('CHUNK_SCOPE');
  const raw = Buffer.concat([carry,incoming]);
  const frames = [];
  let offset = 0;
  if (kind === 'EVENTS') {
    while (offset < raw.length) {
      const i = raw.indexOf(10,offset);
      if (i === -1) break;
      frames.push(eventBytes(raw.subarray(offset,i)));
      offset = i + 1;
    }
    if (raw.length-offset > MAX_RECORD) fail('EVENT_LENGTH');
  } else {
    while (raw.length - offset >= 8) {
      const channel = raw[offset], size = raw.readUInt32BE(offset+4);
      if (![1,2].includes(channel) || raw[offset+1] || raw[offset+2] || raw[offset+3] ||
          size < 1 || size > 512) fail('LOG_HEADER');
      if (raw.length-offset < size+8) break;
      frames.push(logBytes(raw.subarray(offset,offset+size+8)));
      offset += size+8;
    }
  }
  return {frames,remaining:Buffer.from(raw.subarray(offset))};
}
function untilReady(sink,signal,ms) {
  return new Promise((resolve,reject)=>{
    let finished = false;
    const clean = () => {
      sink.off('drain',drain);sink.off('error',error);sink.off('close',closed);
      signal?.removeEventListener('abort',aborted);clearTimeout(timer);
    };
    const done = (code) => { if (finished) return; finished=true;clean();
      if (code) reject(Error('R6Q_BLOCKED_'+code)); else resolve(); };
    const drain=()=>done(); const error=()=>done('SINK_ERROR');
    const closed=()=>done('SINK_CLOSED');const aborted=()=>done('CANCELLED');
    const timer=setTimeout(()=>done('DRAIN_TIMEOUT'),ms);
    sink.once('drain',drain);sink.once('error',error);sink.once('close',closed);
    signal?.addEventListener('abort',aborted,{once:true});
    if (signal?.aborted) done('CANCELLED');
    else if (sink.destroyed) done('SINK_CLOSED');
  });
}

/* Source and sink MUST be owned branded in-memory classes; no generic iterator.
 * Validation is atomic within one inbound chunk. Already written frames cannot
 * be retracted if a subsequent chunk fails. No HTTP or real network timeouts.
 */
export async function pumpR6QOffline(source,sink,{signal=null,deadlineMs=10000,
  drainTimeoutMs=1000,clock=()=>performance.now()}={}) {
  if (!R6QOfflineChunks.isOffline(source) || !R6QOfflineSink.isOffline(sink) ||
      sink.destroyed || sink.writableEnded || source.status().started ||
      (signal !== null && typeof signal?.aborted !== 'boolean') ||
      !Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 30000 ||
      !Number.isSafeInteger(drainTimeoutMs) || drainTimeoutMs < 1 || drainTimeoutMs > 30000 ||
      typeof clock !== 'function') fail('PUMP_SCOPE');
  let carry=Buffer.alloc(0),frames=0,bytes=0,start;
  const check = () => {
    if (signal?.aborted) fail('CANCELLED');
    if (sink.destroyed || sink.writableEnded) fail('SINK_CLOSED');
    let t;try { t=clock(); } catch { fail('CLOCK'); }
    if (!Number.isFinite(t) || (start !== undefined && t < start)) fail('CLOCK');
    if (start === undefined) start=t;
    if (t-start > deadlineMs) fail('DEADLINE');
  };
  try {
    check();
    for await (const chunk of source) {
      check();
      const parsed = parseChunk(source.kind,carry,chunk);
      carry.fill(0);carry=parsed.remaining;
      if (frames + parsed.frames.length > (source.kind === 'EVENTS'?16:MAX_FRAMES)) fail('FRAME_COUNT');
      // Entire inbound chunk validated before first write.
      for (const frame of parsed.frames) {
        check();
        bytes += frame.length;
        if (bytes > MAX_BYTES) fail('OUTPUT_LIMIT');
        frames++;
        if (!sink.write(frame)) await untilReady(sink,signal,drainTimeoutMs);
      }
    }
    if (carry.length !== 0 || frames === 0) fail('TRUNCATED_OR_EMPTY');
    check();
    sink.end();
    // Once end() is called, no more source pulls or further writes occur.
    if (!sink.writableFinished) await new Promise((resolve,reject)=>{
      let finished=false;
      const clean=()=>{sink.off('finish',yes);sink.off('error',bad);sink.off('close',closed);clearTimeout(timer);};
      const done=x=>{if(finished)return;finished=true;clean();x?reject(Error('R6Q_BLOCKED_'+x)):resolve();};
      const yes=()=>done();const bad=()=>done('SINK_ERROR');const closed=()=>done('SINK_CLOSED');
      const timer=setTimeout(()=>done('FINISH_TIMEOUT'),drainTimeoutMs);
      sink.once('finish',yes);sink.once('error',bad);sink.once('close',closed);
      if(sink.writableFinished) done();
    });
    return Object.freeze({ok:true,kind:source.kind,frames,bytes});
  } catch { source.close(); sink.destroy(); fail('STREAM_ABORTED'); }
  finally { carry.fill(0); source.close(); }
}
