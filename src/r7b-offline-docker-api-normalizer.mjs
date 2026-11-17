/* R7B-G1B4: offline-only, synthetic Docker API LIST/INSPECT normalizer.
 * Pure Buffer-to-Buffer projection: NO daemon, filesystem, HTTP, network, TLS,
 * Docker access, real credentials or production metadata. NEVER deploy as a proxy.
 * Accepts extra Docker response fields but only emits a small safe allowlist.
 */

const ID = 'a'.repeat(64);
const NAME = '/r7b-synthetic-fixture';
const IMAGE = 'r7b-public-synthetic@sha256:' + 'b'.repeat(64); // FAKE digest
const IMAGE_ID = 'sha256:' + 'c'.repeat(64); // FAKE image config ID
const LABELS = Object.freeze({'r7b.lab.owner':'LAB_ONLY', 'r7b.lab.role':'fixture'});
const HEX_ID = /^[0-9a-f]{64}$/;
const MAX_BODY = 32768;
const MAX_ITEMS = 12;
const MAX_DEPTH = 12;
const MIN_EPOCH = 1700000000;
const MAX_EPOCH = 4102444800;
const utf8 = new TextDecoder('utf-8', {fatal:true});

function block(code) { throw new Error('R7B4_BLOCKED_' + code); }
function obj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function own(x,k) { return obj(x) && Object.hasOwn(x,k); }
function emptyObj(x) { return obj(x) && Object.keys(x).length === 0; }
function emptyArrayOrNull(x) { return x === null || (Array.isArray(x) && x.length === 0); }
function labelOK(x) {
  return obj(x) && Object.keys(x).length === Object.keys(LABELS).length &&
    Object.entries(LABELS).every(([k,v]) => own(x,k) && x[k] === v);
}
// Independently scan *keys* to prevent duplicate names before trusting JSON.parse.
// JSON.parse validates the actual JSON grammar. JSON.parse on string literals also
// canonicalizes escaped Unicode keys, so `"Id"` and `"\\u0049d"` collide.
function rejectDuplicateKeys(text) {
  let i = 0;
  const white = () => { while (i < text.length && /[ \t\n\r]/.test(text[i])) i++; };
  const quoted = () => {
    const from = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') {
        try { return JSON.parse(text.slice(from,i)); } catch { block('JSON_STRING'); }
      }
    }
    block('JSON_STRING');
  };
  const visit = depth => {
    if (depth > MAX_DEPTH) block('JSON_DEPTH');
    white();
    if (text[i] === '{') {
      i++; white(); const keys = new Set();
      while (text[i] !== '}') {
        if (text[i] !== '"') block('JSON_OBJECT');
        const key = quoted();
        if (keys.has(key)) block('JSON_DUPLICATE');
        keys.add(key); white();
        if (text[i++] !== ':') block('JSON_COLON');
        visit(depth+1); white();
        if (text[i] !== ',') break;
        i++; white();
      }
      if (text[i++] !== '}') block('JSON_OBJECT_END');
    } else if (text[i] === '[') {
      i++; white();
      while (text[i] !== ']') {
        visit(depth+1); white();
        if (text[i] !== ',') break;
        i++; white();
      }
      if (text[i++] !== ']') block('JSON_ARRAY_END');
    } else if (text[i] === '"') quoted();
    else {
      const first = i;
      while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
      if (first === i) block('JSON_PRIMITIVE');
    }
  };
  visit(0); white();
  if (i !== text.length) block('JSON_TRAILING');
}
function json(body) {
  if (!Buffer.isBuffer(body) || body.length < 2 || body.length > MAX_BODY) block('BODY_SCOPE');
  // UTF-8 BOM is rejected explicitly rather than silently discarded.
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) block('BOM');
  let text;
  try { text = utf8.decode(body); } catch { block('UTF8'); }
  let result;
  try { result = JSON.parse(text); } catch { block('JSON_SYNTAX'); }
  rejectDuplicateKeys(text);
  return result;
}
function safeTime(seconds) {
  return Number.isSafeInteger(seconds) && seconds >= MIN_EPOCH && seconds <= MAX_EPOCH;
}
function inspectSeconds(created) {
  if (typeof created !== 'string' ||
      !/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d{1,9})?Z$/.test(created))
    block('INSPECT_CREATED');
  const parsed = Date.parse(created);
  if (!Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0,19) !== created.slice(0,19))
    block('INSPECT_CREATED');
  const seconds = Math.floor(parsed/1000);
  if (!safeTime(seconds)) block('INSPECT_CREATED');
  return seconds;
}
function listTarget(item) {
  if (item.Id !== ID || !Array.isArray(item.Names) || item.Names.length !== 1 ||
      item.Names[0] !== NAME || item.Image !== IMAGE || item.ImageID !== IMAGE_ID ||
      !labelOK(item.Labels) || item.State !== 'running' ||
      typeof item.Status !== 'string' || !/^Up (?:Less than a second|[1-9]\d* (?:seconds?|minutes?|hours?|days?))$/.test(item.Status) ||
      !safeTime(item.Created) || !own(item,'HostConfig') || item.HostConfig.NetworkMode !== 'none' ||
      !own(item,'NetworkSettings') || !emptyObj(item.NetworkSettings.Networks) ||
      !Array.isArray(item.Ports) || item.Ports.length !== 0 ||
      !Array.isArray(item.Mounts) || item.Mounts.length !== 0)
    block('LIST_TARGET');
  return item.Created;
}
function inspectTarget(item,requestedId) {
  if (requestedId !== ID) block('REQUESTED_ID');
  if (!obj(item) || item.Id !== ID || item.Name !== NAME || item.Image !== IMAGE_ID ||
      !own(item,'State') || item.State.Status !== 'running' || item.State.Running !== true ||
      !own(item,'Config') || item.Config.Image !== IMAGE ||
      !labelOK(item.Config.Labels) || item.Config.Tty !== false ||
      (own(item.Config,'Env') && !emptyArrayOrNull(item.Config.Env)) ||
      (own(item.Config,'ExposedPorts') && item.Config.ExposedPorts !== null && !emptyObj(item.Config.ExposedPorts)) ||
      !own(item,'HostConfig') || item.HostConfig.NetworkMode !== 'none' ||
      item.HostConfig.Privileged !== false || item.HostConfig.ReadonlyRootfs !== true ||
      (own(item.HostConfig,'Binds') && !emptyArrayOrNull(item.HostConfig.Binds)) ||
      (own(item.HostConfig,'Mounts') && !emptyArrayOrNull(item.HostConfig.Mounts)) ||
      (own(item.HostConfig,'Devices') && !emptyArrayOrNull(item.HostConfig.Devices)) ||
      (own(item.HostConfig,'CapAdd') && !emptyArrayOrNull(item.HostConfig.CapAdd)) ||
      (own(item.HostConfig,'PortBindings') && item.HostConfig.PortBindings !== null && !emptyObj(item.HostConfig.PortBindings)) ||
      !Array.isArray(item.Mounts) || item.Mounts.length !== 0 ||
      !own(item,'NetworkSettings') || !emptyObj(item.NetworkSettings.Networks) ||
      (own(item.NetworkSettings,'Ports') && item.NetworkSettings.Ports !== null && !emptyObj(item.NetworkSettings.Ports)))
    block('INSPECT_TARGET');
  return inspectSeconds(item.Created);
}
function extractList(body) {
  const input = json(body);
  if (!Array.isArray(input) || input.length > MAX_ITEMS) block('LIST_SCOPE');
  let found = null;
  for (const item of input) {
    if (!obj(item) || typeof item.Id !== 'string' || !HEX_ID.test(item.Id)) block('LIST_ITEM');
    if (item.Id !== ID) continue; // Foreign records never emitted or inspected.
    if (found !== null) block('LIST_DUPLICATE');
    found = listTarget(item);
  }
  return found;
}
function safeList(created) {
  return created === null ? [] : [{Id:ID,Names:[NAME],Image:IMAGE,ImageID:IMAGE_ID,
    Labels:{...LABELS},State:'running',Created:created,Ports:[],Mounts:[],
    HostConfig:{NetworkMode:'none'},NetworkSettings:{Networks:{}}}];
}
function safeInspect(created) {
  return {Id:ID,Name:NAME,Image:IMAGE_ID,Created:created,
    State:{Status:'running',Running:true},Config:{Image:IMAGE,Labels:{...LABELS},Tty:false},
    HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true},
    Mounts:[],NetworkSettings:{Networks:{}}};
}
/** Accept extra real-shaped fields, but only for the exact fake lab identity. */
export function normalizeR7BOfflineDockerList(body) {
  return Buffer.from(JSON.stringify(safeList(extractList(body))));
}
/** Accept extra real-shaped fields, never forward Env/LogPath/Command etc. */
export function normalizeR7BOfflineDockerInspect(body,requestedId) {
  const inspected = json(body);
  inspectTarget(inspected,requestedId);
  return Buffer.from(JSON.stringify(safeInspect(inspected.Created)));
}
/** Cross-check LIST and INSPECT (including creation seconds) before exposing outputs. */
export function normalizeR7BOfflineDockerPair(listBody,inspectBody,requestedId) {
  if (requestedId !== ID) block('REQUESTED_ID');
  const listCreated = extractList(listBody);
  if (listCreated === null) block('LIST_MISSING');
  const inspected = json(inspectBody);
  const inspectCreated = inspectTarget(inspected,requestedId);
  if (listCreated !== inspectCreated) block('CREATED_DRIFT');
  return Object.freeze({list:Buffer.from(JSON.stringify(safeList(listCreated))),
    inspect:Buffer.from(JSON.stringify(safeInspect(inspected.Created)))});
}
