/* R7B-G1B11: bounded, in-memory synthetic contract session ONLY.
 * This is NOT a Docker transport, Vector/Bollard process, TLS gateway or live stream.
 * Inputs are creation timestamp and sample clock; all identities and log bytes are
 * generated from owned public fixtures. No raw upstream Docker buffers accepted.
 */
import {buildR7BBollard0192SyntheticPair} from './r7b-bollard0192-fixture.mjs';
import {normalizeR7BOfflineDockerPair} from './r7b-offline-docker-api-normalizer.mjs';
import {planR7BVector053ReadOnly, renderR7BVector053SyntheticEvent,
  r7bVector053ContractFacts} from './r7b-vector053-wire-contract.mjs';
import {createR7BSyntheticStream} from './r7b-bounded-synthetic-stream.mjs';

const ID = 'a'.repeat(64);
const MARKER = 'R7B_PUBLIC_SYNTHETIC_ONLY';
const MAX_SECONDS = 2147483647;
const fail = code => { throw Error('R7B11_BLOCKED_' + code); };
const own = (value, keys) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail('SCOPE');
  const props = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(props).length !== keys.length ||
      !keys.every(k => Object.hasOwn(props, k)) ||
      Object.values(props).some(p => !Object.hasOwn(p, 'value'))) fail('SCOPE');
  return Object.fromEntries(keys.map(k => [k, props[k].value]));
};

/** Only the exact canonical event bytes built by the pinned synthetic generator. */
export function assertR7B11GeneratedEventWire(actual, inputs) {
  if (!Buffer.isBuffer(actual) || actual.length < 1 || actual.length > 768) fail('EVENT_SCOPE');
  let expected;
  try { expected = renderR7BVector053SyntheticEvent(own(inputs, ['action','time','timeNano'])); }
  catch { fail('EVENT_INPUT'); }
  if (!actual.equals(expected)) fail('EVENT_WIRE');
  return true;
}

const makeFrame = (channel, stamp) => {
  const payload = Buffer.from(`${stamp} ${MARKER}\n`);
  if (payload.length < 1 || payload.length > 512) fail('LOG_PAYLOAD');
  const header = Buffer.alloc(8);
  header[0] = channel;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

/** Validates two synthetic Docker mux frames using the historic bounded parser. */
function validateOwnedLogs(stamp) {
  const parser = createR7BSyntheticStream('LOGS');
  const raw = Buffer.concat([makeFrame(1, stamp), makeFrame(2, stamp)]);
  const outputs = [];
  try {
    // Split across header and payload boundaries: no network and no external inputs.
    for (let i = 0; i < raw.length; i += 7) {
      parser.push(Buffer.from(raw.subarray(i, Math.min(i + 7, raw.length))));
      outputs.push(...parser.take());
    }
    const status = parser.finish();
    if (status.state !== 'ENDED' || status.records !== 2 || outputs.length !== 2 ||
        !outputs[0].equals(makeFrame(1, stamp)) ||
        !outputs[1].equals(makeFrame(2, stamp))) fail('LOG_MISMATCH');
    return Object.freeze(outputs.map(b => Buffer.from(b)));
  } catch { for (const b of outputs) b.fill(0); fail('LOG_INVALID'); }
  finally { if (parser.status().state === 'ACTIVE') parser.cancel(); raw.fill(0); }
}

/** Complete contract-only flight: LIST + INSPECT + 4 fake events + muxed LOGS.
 * It proves composition of EXISTING JS fixtures, not runtime Vector interoperability.
 */
export function runR7B11SyntheticSession(args) {
  const {created, nowSeconds} = own(args, ['created','nowSeconds']);
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 2 || nowSeconds > MAX_SECONDS)
    fail('CLOCK');
  let normalized;
  try {
    const raw = buildR7BBollard0192SyntheticPair({created});
    normalized = normalizeR7BOfflineDockerPair(raw.list, raw.inspect, ID);
  } catch { fail('METADATA'); }
  const list = JSON.parse(normalized.list.toString());
  const inspect = JSON.parse(normalized.inspect.toString());
  if (list.length !== 1 || list[0].Id !== ID || inspect.Id !== ID ||
      list[0].Created > nowSeconds || inspect.Name !== '/r7b-synthetic-fixture' ||
      inspect.Created !== created || inspect.Config.Image !== list[0].Image)
    fail('CROSS_CONTRACT');
  const plan = planR7BVector053ReadOnly({nowSeconds, containerId:ID});
  const actions = r7bVector053ContractFacts().eventActions;
  const events = actions.map((action, i) => {
    const timeNano = String(BigInt(nowSeconds) * 1000000000n + BigInt(i));
    const wire = renderR7BVector053SyntheticEvent({action, time:nowSeconds, timeNano});
    assertR7B11GeneratedEventWire(wire, {action, time:nowSeconds, timeNano});
    return wire;
  });
  const logs = validateOwnedLogs(created);
  return Object.freeze({plan, list:Buffer.from(normalized.list),
    inspect:Buffer.from(normalized.inspect), events:Object.freeze(events), logs,
    kind:'OFFLINE_PUBLIC_SYNTHETIC_ONLY'});
}
