/* R6O PUBLIC OFFLINE-ONLY Vector protocol-shape session.
 * In-memory fake responses only. No Docker socket, HTTP(S), TLS or process I/O.
 * This is NOT a production Vector gateway or proof of real interoperability.
 */
import { planR6NVectorGet, projectR6NList, projectR6NInspect,
  projectR6NEvent, assertR6NVectorShape } from './r6n-vector-v053-contract.mjs';
import { OfflineR6LChunks, relayR6LOffline } from './r6l-offline-pull-relay.mjs';

const fail = category => { throw new Error('R6O_BLOCKED_' + category); };
const ALLOWED = new Set(['PING', 'VERSION', 'LIST', 'INSPECT', 'EVENTS', 'LOGS']);
const enc = value => Buffer.from(JSON.stringify(value), 'utf8');
const safeSignal = signal => signal === null ||
  (typeof signal === 'object' && signal !== null && typeof signal.aborted === 'boolean');

/** Pre-validate a complete, bounded fake scenario before any bytes are released.
 * No user-supplied callbacks, external iterators or untrusted transports accepted.
 */
export class R6OOfflineScenario {
  #spec; #list; #inspect; #events; #source; #opened; #closed = false;
  constructor({spec, list, inspect, events, logChunks} = {}) {
    let source;
    try {
      if (!Array.isArray(events) || events.length < 1 || events.length > 16) fail('EVENT_COUNT');
      const validList = projectR6NList(list, spec);
      if (validList.length !== 1) fail('NO_OWNED_CONTAINER');
      const validInspect = projectR6NInspect(inspect, spec);
      const validEvents = events.map(e => projectR6NEvent(e, spec));
      assertR6NVectorShape({list:validList, inspect:validInspect, event:validEvents[0]}, spec);
      source = new OfflineR6LChunks(logChunks);
      this.#spec = spec;
      this.#list = validList;
      this.#inspect = validInspect;
      this.#events = validEvents;
      this.#source = source;
      this.#opened = new Set();
    } catch {
      source?.close();
      fail('SCENARIO_PROOF');
    }
    Object.freeze(this);
  }
  static isOffline(value) {
    return value instanceof R6OOfflineScenario &&
      Object.getPrototypeOf(value) === R6OOfflineScenario.prototype && #spec in value;
  }
  plan(request) {
    if (this.#closed) fail('CLOSED');
    try {
      const result = planR6NVectorGet(request, this.#spec);
      if (!ALLOWED.has(result.kind) || result.inert !== true || result.method !== 'GET') fail('ROUTE');
      return Object.freeze({kind:result.kind,stream:result.stream,method:'GET'});
    } catch { fail('REQUEST'); }
  }
  open(request, {signal = null, eventChunkBytes = 64, maxElapsedMs = 10000,
                 clock = () => performance.now()} = {}) {
    if (this.#closed) fail('CLOSED');
    if (!safeSignal(signal) || !Number.isSafeInteger(eventChunkBytes) ||
        eventChunkBytes < 1 || eventChunkBytes > 256 ||
        !Number.isSafeInteger(maxElapsedMs) || maxElapsedMs < 1 ||
        maxElapsedMs > 30000 || typeof clock !== 'function') fail('OPTIONS');
    const plan = this.plan(request);
    if (plan.stream && this.#opened.has(plan.kind)) fail('STREAM_REOPEN');
    if (plan.stream) this.#opened.add(plan.kind);
    const current = this;
    let consumed = false;
    const type = plan.kind === 'LOGS' ? 'application/vnd.docker.multiplexed-stream' :
      plan.kind === 'EVENTS' ? 'application/x-ndjson' :
      plan.kind === 'PING' ? 'text/plain' : 'application/json';
    return Object.freeze({status:200,kind:plan.kind,stream:plan.stream,contentType:type,
      async *bytes() {
        if (consumed) fail('RESPONSE_REUSED');
        consumed = true;
        let started;
        const check = () => {
          if (current.#closed || signal?.aborted) fail('CANCELLED');
          let t;
          try { t = clock(); } catch { fail('CLOCK'); }
          if (!Number.isFinite(t)) fail('CLOCK');
          if (started === undefined) started = t;
          if (t < started || t - started > maxElapsedMs) fail('DEADLINE');
        };
        try {
          check();
          if (plan.kind === 'LOGS') {
            try {
              for await (const frame of relayR6LOffline(current.#source,
                {signal,maxElapsedMs,clock})) {
                check();
                yield Buffer.from(frame);
              }
              check();
            } catch { fail('LOG_STREAM'); }
            return;
          }
          let chunks;
          if (plan.kind === 'PING') chunks = [Buffer.from('OK')];
          else if (plan.kind === 'VERSION') chunks = [enc({Version:'0.0.0-r6o-offline',ApiVersion:'1.44',MinAPIVersion:'1.40'})];
          else if (plan.kind === 'LIST') chunks = [enc(current.#list)];
          else if (plan.kind === 'INSPECT') chunks = [enc(current.#inspect)];
          else if (plan.kind === 'EVENTS') {
            chunks = current.#events.map(e => Buffer.from(JSON.stringify(e)+'\n','utf8'));
          } else fail('ROUTE');
          for (const chunk of chunks) {
            for (let at = 0; at < chunk.length; at += eventChunkBytes) {
              check();
              yield Buffer.from(chunk.subarray(at,at+eventChunkBytes));
            }
          }
          check();
        } finally {
          if (plan.kind === 'LOGS') current.#source.close();
        }
      }
    });
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#source.close();
  }
  status() {
    return Object.freeze({closed:this.#closed,streamsOpened:this.#opened.size,
      logSourceClosed:this.#source.status().closed,
      logChunksPulled:this.#source.status().pulled});
  }
}
