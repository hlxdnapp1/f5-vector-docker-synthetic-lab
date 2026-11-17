/* R7B-G1B3: synthetic-only Docker LIST/INSPECT metadata projection.
 * Pure offline Buffers; no HTTP, filesystem, Docker daemon or real credentials.
 * This exact fixture schema is NOT a parser for arbitrary real Docker responses.
 */

const ID = 'a'.repeat(64);
const NAME = '/r7b-synthetic-fixture';
const IMAGE = 'r7b-public-synthetic@sha256:' + 'b'.repeat(64); // FAKE, never pull
const IMAGE_ID = 'sha256:' + 'c'.repeat(64); // FAKE, not OCI evidence
const LABELS = Object.freeze({ 'r7b.lab.owner': 'LAB_ONLY', 'r7b.lab.role': 'fixture' });
const CREATED = 1794860000;
const CREATED_ISO = new Date(CREATED * 1000).toISOString();
const MAX_JSON = 16384;
const MAX_LIST_ITEMS = 12;
const HEX_ID = /^[0-9a-f]{64}$/;
const decoder = new TextDecoder('utf-8', {fatal: true});

function fail(code) { throw new Error('R7B_METADATA_BLOCKED_' + code); }
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function sameFields(value, expected) {
  return exact(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, field]) => value[key] === field);
}

// JSON.parse alone accepts repeated object keys (last one wins). Reject such input.
// The native parser is authoritative for JSON grammar; this extra scan tracks keys
// at every nesting level and caps nesting to avoid ambiguous authorization input.
function denyDuplicateKeys(text) {
  let i = 0;
  function spaces() { while (/[ \t\r\n]/.test(text[i] ?? '')) i++; }
  function quoted() {
    const from = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') return JSON.parse(text.slice(from, i));
    }
    fail('JSON_STRING');
  }
  function visit(depth) {
    if (depth > 10) fail('JSON_DEPTH');
    spaces();
    if (text[i] === '{') {
      i++; spaces();
      const used = new Set();
      while (text[i] !== '}') {
        if (text[i] !== '"') fail('JSON_OBJECT');
        const key = quoted();
        if (used.has(key)) fail('JSON_DUPLICATE_KEY');
        used.add(key);
        spaces(); if (text[i++] !== ':') fail('JSON_COLON');
        visit(depth + 1); spaces();
        if (text[i] !== ',') break;
        i++; spaces();
      }
      if (text[i++] !== '}') fail('JSON_OBJECT_END');
    } else if (text[i] === '[') {
      i++; spaces();
      while (text[i] !== ']') {
        visit(depth + 1); spaces();
        if (text[i] !== ',') break;
        i++; spaces();
      }
      if (text[i++] !== ']') fail('JSON_ARRAY_END');
    } else if (text[i] === '"') {
      quoted();
    } else {
      const start = i;
      while (i < text.length && !/[\s,}\]]/.test(text[i])) i++;
      if (i === start) fail('JSON_PRIMITIVE');
    }
  }
  visit(0); spaces();
  if (i !== text.length) fail('JSON_TRAILING');
}
function readBody(body) {
  if (!Buffer.isBuffer(body) || body.length < 2 || body.length > MAX_JSON) fail('BODY_SCOPE');
  let text;
  try { text = decoder.decode(body); } catch { fail('UTF8'); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('JSON_SYNTAX'); }
  denyDuplicateKeys(text);
  return parsed;
}
function validListTarget(item) {
  if (!exact(item, ['Id','Names','Image','ImageID','Labels','State','Status','Created']) ||
      item.Id !== ID || !Array.isArray(item.Names) || item.Names.length !== 1 ||
      item.Names[0] !== NAME || item.Image !== IMAGE || item.ImageID !== IMAGE_ID ||
      !sameFields(item.Labels, LABELS) || item.State !== 'running' ||
      item.Status !== 'Up 1 second' || item.Created !== CREATED) fail('LIST_TARGET');
}
function safeList() {
  return {Id: ID, Names: [NAME], Image: IMAGE, ImageID: IMAGE_ID,
    Labels: {...LABELS}, State: 'running', Status: 'Up 1 second', Created: CREATED};
}
function validInspectTarget(item) {
  if (!exact(item, ['Id','Name','Created','State','Config','HostConfig','Mounts','NetworkSettings']) ||
      item.Id !== ID || item.Name !== NAME || item.Created !== CREATED_ISO ||
      !sameFields(item.State, {Status:'running',Running:true}) ||
      !exact(item.Config, ['Image','Labels','Tty']) || item.Config.Image !== IMAGE ||
      !sameFields(item.Config.Labels, LABELS) || item.Config.Tty !== false ||
      !sameFields(item.HostConfig, {NetworkMode:'none', Privileged:false, ReadonlyRootfs:true}) ||
      !Array.isArray(item.Mounts) || item.Mounts.length !== 0 ||
      !exact(item.NetworkSettings, ['Networks']) || !exact(item.NetworkSettings.Networks, []))
    fail('INSPECT_TARGET');
}
function safeInspect() {
  return {Id:ID, Name:NAME, Created:CREATED_ISO,
    State:{Status:'running',Running:true},
    Config:{Image:IMAGE,Labels:{...LABELS},Tty:false},
    HostConfig:{NetworkMode:'none',Privileged:false,ReadonlyRootfs:true},
    Mounts:[],NetworkSettings:{Networks:{}}};
}

/** Only one public fixture ID may be projected. Foreign IDs are never emitted. */
export function projectR7BOfflineList(body) {
  const items = readBody(body);
  if (!Array.isArray(items) || items.length > MAX_LIST_ITEMS) fail('LIST_SCOPE');
  let found = false;
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item) ||
        typeof item.Id !== 'string' || !HEX_ID.test(item.Id)) fail('LIST_ITEM');
    if (item.Id !== ID) continue; // Never inspect or emit foreign fields.
    if (found) fail('LIST_DUPLICATE');
    validListTarget(item);
    found = true;
  }
  return Buffer.from(JSON.stringify(found ? [safeList()] : []));
}

/** Inspects only the single fixed synthetic fixture, never an arbitrary path/ID. */
export function projectR7BOfflineInspect(body, requestedId) {
  if (requestedId !== ID) fail('REQUESTED_ID');
  const item = readBody(body);
  validInspectTarget(item);
  return Buffer.from(JSON.stringify(safeInspect()));
}

/** Cross-check LIST/INSPECT coherence before publishing either output. */
export function projectR7BOfflinePair(listBody, inspectBody, requestedId) {
  if (requestedId !== ID) fail('REQUESTED_ID');
  const list = projectR7BOfflineList(listBody);
  if (JSON.parse(list.toString()).length !== 1) fail('LIST_MISSING');
  const inspect = projectR7BOfflineInspect(inspectBody, requestedId);
  return Object.freeze({list,inspect});
}
