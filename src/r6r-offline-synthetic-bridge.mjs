/* EXATA R6R - public OFFLINE-ONLY bridge for already approved R6O/R6Q fakes.
 * NO Docker Engine, HTTP(S), TLS, socket, process, file I/O or real Vector.
 * This explicitly MATERIALIZES complete finite in-memory streams before pumping.
 * It is not real backpressure across a network and not a reconnecting client.
 */
import {R6OOfflineScenario} from './r6o-offline-vector-session.mjs';
import {R6QOfflineChunks,R6QOfflineSink,pumpR6QOffline} from './r6q-offline-node-stream.mjs';

const MAX_CHUNKS = 512;
const MAX_BYTES = 65536;
const fail = reason => { throw new Error('R6R_BLOCKED_' + reason); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requestAllowed(scenario, request, kind) {
  if (!object(request) || request.method !== 'GET' ||
      typeof request.target !== 'string') fail('REQUEST');
  const plan = scenario.plan(request);
  if (plan.kind !== kind || plan.stream !== true || plan.method !== 'GET')
    fail('REQUEST_KIND');
  return true;
}

async function collectFinite(response, signal, limitBytes) {
  if (!object(response) || response.status !== 200 ||
      typeof response.bytes !== 'function' || response.stream !== true) fail('RESPONSE');
  const chunks = [];
  let total = 0;
  try {
    for await (const part of response.bytes()) {
      if (signal?.aborted) fail('CANCELLED');
      if (!Buffer.isBuffer(part) || part.length < 1 || part.length > 2048 ||
          ++total > Number.MAX_SAFE_INTEGER) fail('CHUNK');
      total += part.length - 1;
      if (chunks.length >= MAX_CHUNKS || total > limitBytes) fail('LIMIT');
      chunks.push(Buffer.from(part));
    }
    if (signal?.aborted) fail('CANCELLED');
    if (chunks.length === 0) fail('EMPTY');
    return chunks;
  } catch { for (const b of chunks) b.fill(0); fail('COLLECTION'); }
}

/**
 * R6O validates synthetic LIST/INSPECT and EVENTS at construction. R6R
 * preserves the R6O route planner and consumes only its *finite* fake streams.
 * R6Q revalidates and pumps each materialized stream into an in-memory Writable.
 * No payload or private container identifier is returned.
 */
export async function runR6ROffline({scenario, eventsRequest, logsRequest,
  signal = null, limitBytes = MAX_BYTES} = {}) {
  if (!R6OOfflineScenario.isOffline(scenario) ||
      !Number.isSafeInteger(limitBytes) || limitBytes < 1 || limitBytes > MAX_BYTES ||
      (signal !== null && (typeof signal !== 'object' ||
        typeof signal.aborted !== 'boolean'))) fail('SCOPE');
  const captured = [];
  try {
    if (signal?.aborted) fail('CANCELLED');
    requestAllowed(scenario, eventsRequest, 'EVENTS');
    requestAllowed(scenario, logsRequest, 'LOGS');
    for (const [kind, request] of [['EVENTS',eventsRequest],['LOGS',logsRequest]]) {
      const response = scenario.open(request,{signal});
      if (response.kind !== kind || response.stream !== true) fail('RESPONSE_KIND');
      const chunks = await collectFinite(response,signal,limitBytes);
      captured.push({kind,chunks});
    }
    const results = [];
    for (const {kind,chunks} of captured) {
      let source;
      try {
        source = new R6QOfflineChunks(kind,chunks);
        const sink = new R6QOfflineSink();
        const result = await pumpR6QOffline(source,sink,{signal});
        if (result.kind !== kind || result.ok !== true) fail('PUMP');
        results.push(Object.freeze({kind,frames:result.frames,bytes:result.bytes}));
      } finally {
        if (source) source.close();
        for (const chunk of chunks) chunk.fill(0);
      }
    }
    return Object.freeze({
      result:'PASS_SYNTHETIC_FINITE_ONLY',
      events:results[0].frames,
      logFrames:results[1].frames,
      eventBytes:results[0].bytes,
      logBytes:results[1].bytes,
      checkpoint:'NONE',
      deduplication:'NOT_PROVEN',
      trueStreaming:false,
      realTransport:false
    });
  } catch {
    scenario.close();
    fail('FLOW');
  } finally {
    scenario.close();
    for (const entry of captured) for (const b of entry.chunks) b.fill(0);
  }
}

/** Two independently constructed fake sessions deliberately make NO claim
 * about resume/since/reconnection. Replayed events are counted twice.
 */
export async function demonstrateR6RReplay({first, second, eventsRequest, logsRequest} = {}) {
  if (!R6OOfflineScenario.isOffline(first) || !R6OOfflineScenario.isOffline(second) ||
      first === second) fail('REPLAY_SCOPE');
  try {
    const one = await runR6ROffline({scenario:first,eventsRequest,logsRequest});
    const two = await runR6ROffline({scenario:second,eventsRequest,logsRequest});
    return Object.freeze({
      sessions:2,
      totalSyntheticEvents:one.events + two.events,
      totalSyntheticLogFrames:one.logFrames + two.logFrames,
      checkpoint:'NONE',
      deduplication:'NOT_PROVEN',
      networkReconnect:false,
      realTransport:false
    });
  } catch {
    first.close();second.close();fail('REPLAY_FLOW');
  }
}
