/* R7B-G1B6 - offline-only Bollard 0.19.2 metadata fixture for Vector 0.53.0.
 * Never consumes live Docker input. Never connects to Docker/network/Windows.
 * Bollard model: bollard-stubs 1.49.0-rc.28.3.3, Docker API 1.49.
 */
const ID = 'a'.repeat(64);
const NAME = '/r7b-synthetic-fixture';
const IMAGE = 'r7b-public-synthetic@sha256:' + 'b'.repeat(64); // FAKE
const IMAGE_ID = 'sha256:' + 'c'.repeat(64); // FAKE
const LABELS = Object.freeze({'r7b.lab.owner':'LAB_ONLY','r7b.lab.role':'fixture'});
const MAX_INPUT = 96;
const CREATED = /^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,9}))?Z$/;
const MIN_EPOCH = 1700000000;
const MAX_EPOCH = 2147483647;
function reject(code) { throw new Error('R7B_BOLLARD0192_BLOCKED_' + code); }
function createdSeconds(created) {
  if (typeof created !== 'string' || created.length > MAX_INPUT) reject('CREATED_TYPE');
  const m = CREATED.exec(created);
  if (!m) reject('CREATED_FORMAT');
  const ms = Date.parse(m[1] + 'Z');
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,19) !== m[1]) reject('CREATED_CALENDAR');
  const seconds = ms/1000;
  if (!Number.isSafeInteger(seconds) || seconds < MIN_EPOCH || seconds > MAX_EPOCH) reject('CREATED_RANGE');
  return seconds;
}
function options(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) reject('OPTIONS');
  const props = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(props).length !== 1 || !Object.hasOwn(props,'created')) reject('OPTIONS');
  if (!Object.hasOwn(props.created,'value')) reject('GETTER');
  return props.created.value;
}
function safeList(createdSecondsValue) {
  return [{Id:ID,Names:[NAME],Image:IMAGE,ImageID:IMAGE_ID,
    Labels:{...LABELS},State:'running',Status:'Up 1 second',Created:createdSecondsValue,
    HostConfig:{NetworkMode:'none'},NetworkSettings:{Networks:{}},Ports:[],Mounts:[]}];
}
function safeInspect(created) {
  return {Id:ID,Name:NAME,Image:IMAGE_ID,Created:created,
    Config:{Image:IMAGE,Labels:{...LABELS},Tty:false,Env:[],ExposedPorts:{}},
    State:{Status:'running',Running:true},
    HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true},
    Mounts:[],NetworkSettings:{Networks:{},Ports:{}}};
}
/** Returns only owned in-memory fake responses, with exact RFC3339 nanosecond text intact. */
export function buildR7BBollard0192SyntheticPair(value) {
  const created = options(value);
  const seconds = createdSeconds(created);
  const list = Buffer.from(JSON.stringify(safeList(seconds)));
  const inspect = Buffer.from(JSON.stringify(safeInspect(created)));
  return Object.freeze({list,inspect});
}
/** Facts pinned to the actual dependency graph, not a runtime Rust/Serde proof. */
export function r7bBollard0192Facts() {
  return Object.freeze({
    vectorCommit:'2b51b40a7a0b40996350d73cf46791c7e991fcb6',
    vectorCargoLockBlob:'9f981864e8fae195b49a1c61ed388c399603b570',
    bollardVersion:'0.19.2',
    bollardStubsVersion:'1.49.0-rc.28.3.3',
    bollardTagCommit:'5e83c3d9e489f115d3e4ae8f5f4c70eb38d1ba21',
    stubsModelsBlob:'199da7631a06db8f62c6facab9a71edb0ee8f50a',
    createdType:'Option<BollardDate>',
    requiredByVector:Object.freeze(['Id','Names','Config','Name','Created','Config.Image']),
    result:'OFFLINE_FIXTURE_NOT_RUST_DESERIALIZATION'
  });
}
