/* R7B-G1B5: offline synthetic Vector 0.53.0 docker_logs wire contract.
 * NO network, socket, Docker calls, credentials, filesystem or real container IDs.
 * Models request OPTIONS, not HTTP transport or Vector/Bollard deserialization.
 */
const ID = 'a'.repeat(64);
const NAME = 'r7b-synthetic-fixture';
const LABEL = 'r7b.lab.owner=LAB_ONLY';
const ACTIONS = Object.freeze(['start', 'unpause', 'die', 'pause']);
const MAX_SECONDS = 2147483647; // Vector v0.53.0 logs .since(... as i32), 2038 guard.
const MAX_I64 = 9223372036854775807n;
const NANO_PER_SECOND = 1000000000n;

function fail(code) { throw new Error('R7B_VECTOR053_BLOCKED_' + code); }
function seconds(value) {
  if (!Number.isSafeInteger(value) || value < 2 || value > MAX_SECONDS) fail('SINCE_SECONDS');
  return value;
}
function immutableObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail('ARGUMENT_SHAPE');
  const props = Object.getOwnPropertyDescriptors(value);
  if (Object.values(props).some(p => !Object.hasOwn(p, 'value'))) fail('ACCESSOR');
  return props;
}
function namedArgs(value, keys) {
  const properties = immutableObject(value);
  if (Object.keys(properties).length !== keys.length ||
      !keys.every(key => Object.hasOwn(properties, key))) fail('ARGUMENT_FIELDS');
  return Object.fromEntries(keys.map(key => [key, properties[key].value]));
}

/** Offline-only plan describing the exact initial GETs/options used by Vector's docker_logs source. */
export function planR7BVector053ReadOnly(args) {
  const {nowSeconds, containerId} = namedArgs(args, ['nowSeconds', 'containerId']);
  seconds(nowSeconds);
  if (containerId !== ID) fail('CONTAINER_ID');
  const get = (path, query = {}) => Object.freeze({
    method: 'GET', path, query: Object.freeze(query)
  });
  const labelFilters = () => Object.freeze({label: Object.freeze([LABEL])});
  const plan = {
    list: get('/containers/json', {all: false, filters: labelFilters()}),
    inspect: get(`/containers/${ID}/json`),
    events: get('/events', {
      since: String(nowSeconds),
      filters: Object.freeze({
        event: ACTIONS, type: Object.freeze(['container']),
        label: Object.freeze([LABEL])
      })
    }),
    logs: get(`/containers/${ID}/logs`, {
      follow: true, stdout: true, stderr: true,
      since: nowSeconds - 1, timestamps: true
    })
  };
  return Object.freeze(plan);
}

/** Re-emit a fake Docker EventMessage, with exact i64 timeNano as a JSON NUMBER.
 * The nanosecond token enters as a DECIMAL STRING to prevent JS IEEE-754 rounding.
 * No incoming Docker data or arbitrary JSON is ever accepted by this module.
 */
export function renderR7BVector053SyntheticEvent(args) {
  const {action, time, timeNano} = namedArgs(args, ['action', 'time', 'timeNano']);
  if (!ACTIONS.includes(action)) fail('ACTION');
  seconds(time);
  if (typeof timeNano !== 'string' || !/^[1-9][0-9]{9,18}$/.test(timeNano)) fail('NANO_TOKEN');
  const nanos = BigInt(timeNano);
  if (nanos > MAX_I64 || nanos / NANO_PER_SECOND !== BigInt(time)) fail('NANO_TIME');
  const prefix = JSON.stringify({
    Type:'container', Action:action,
    Actor:{ID, Attributes:{name:NAME,'r7b.lab.owner':'LAB_ONLY'}},
    time
  });
  // Append a numeric token, never JSON.stringify(BigInt) or Number(nanos).
  return Buffer.from(prefix.slice(0, -1) + ',"timeNano":' + timeNano + '}\n');
}

export function r7bVector053ContractFacts() {
  return Object.freeze({
    sourceTag: 'v0.53.0',
    sourceCommit: '2b51b40a7a0b40996350d73cf46791c7e991fcb6',
    sourceBlob: '45268788d45cc869f36b34d9b9791c05cd7b3e83',
    eventActions: ACTIONS,
    timeNanoType: 'JSON_integer_i64',
    initialLogsSince: 'now_seconds_minus_1',
    logOutput: 'docker_multiplexed_stream',
    implementation: 'OFFLINE_SYNTHETIC_ONLY'
  });
}
