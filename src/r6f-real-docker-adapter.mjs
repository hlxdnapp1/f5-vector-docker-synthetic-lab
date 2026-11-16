/* PUBLIC R6F review candidate: read-only Docker probe, not a production proxy.
 * A GitHub-hosted lab may eventually inject a verified Unix transport; nothing
 * in this module connects to Docker or starts a server at import time.
 * An attested, isolated synthetic container is mandatory before any upstream GET.
 */
const FAKE = 'a'.repeat(64);
const ID = /^[a-f0-9]{64}$/;
const MARKER = 'R6F_PUBLIC_SYNTHETIC_ONLY';
const MAX_BODY = 32768;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const safe = (kind, body, contentType = 'application/json') => ({ ok: true, kind, body, contentType });
const deny = kind => ({ ok: false, kind, body: null, contentType: null });
const asJson = value => {
  if (!Buffer.isBuffer(value) || value.length > MAX_BODY) return null;
  try { return JSON.parse(utf8.decode(value)); } catch { return null; }
};
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const digits = x => /^(?:0|[1-9][0-9]{0,10})$/.test(x);
const json = x => Buffer.from(JSON.stringify(x));

/** Only a fresh, lab-labelled container without privileges, volumes or network can be targeted. */
export function attestLabContainer(value, id) {
  if (!ID.test(id) || id === FAKE || !obj(value) || value.Id !== id ||
      typeof value.Name !== 'string' || !/^\/r6f-synthetic-[a-z0-9]{8}$/.test(value.Name) ||
      !obj(value.Config) || value.Config.Tty !== false ||
      !obj(value.Config.Labels) || value.Config.Labels['f5.synthetic.lab'] !== 'R6F_ONLY' ||
      !obj(value.HostConfig) || value.HostConfig.Privileged !== false ||
      value.HostConfig.NetworkMode !== 'none' ||
      !Array.isArray(value.Mounts) || value.Mounts.length !== 0 ||
      (value.HostConfig.Binds !== null && value.HostConfig.Binds !== undefined &&
       (!Array.isArray(value.HostConfig.Binds) || value.HostConfig.Binds.length !== 0))) return false;
  return true;
}

/** Project client requests into NEW, strictly bounded Docker GET paths (never forward a caller path). */
export function planLabRead(request, id, nowSec = Math.floor(Date.now()/1000)) {
  if (!ID.test(id) || id === FAKE) return deny('INVALID_LAB_ID');
  if (!request || request.method !== 'GET') return deny('METHOD_DENIED');
  const raw = request.target;
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2048 ||
      !raw.startsWith('/') || raw.startsWith('//') || /[\x00-\x20\x7f\\#]/.test(raw) ||
      raw.split('?').length > 2) return deny('TARGET_DENIED');
  const qi = raw.indexOf('?');
  const path = qi < 0 ? raw : raw.slice(0,qi);
  if (path.includes('%') || path.includes('..') || path.includes('//')) return deny('TARGET_DENIED');
  const vm = /^\/v1\.(\d\d)(\/.*)$/.exec(path);
  if (path.startsWith('/v1.') && (!vm || +vm[1] < 40 || +vm[1] > 59)) return deny('API_VERSION_DENIED');
  const route = vm ? vm[2] : path;
  if (/^\/v(?:\d|\.)/.test(route) && !vm) return deny('API_VERSION_DENIED');
  let query;
  try { query = new URLSearchParams(qi < 0 ? '' : raw.slice(qi+1)); } catch { return deny('QUERY_DENIED'); }
  const keys = [...query.keys()];
  if (keys.length !== new Set(keys).size) return deny('DUPLICATE_QUERY');
  const only = names => keys.every(key => names.includes(key));
  const qObject = value => {
    try { return obj(JSON.parse(value)); } catch { return false; }
  };
  if (route === '/_ping' || route === '/version') {
    if (keys.length) return deny('QUERY_DENIED');
    return { ok:true, kind:route === '/_ping'?'PING':'VERSION', path:route, cap:8192 };
  }
  if (route === '/containers/json') {
    if (!only(['all','filters','size']) || query.get('all') !== 'false' ||
        (query.has('size') && query.get('size') !== 'false') ||
        !query.has('filters') || !qObject(query.get('filters'))) return deny('LIST_SCOPE_DENIED');
    const filters = encodeURIComponent(JSON.stringify({ id:[id] }));
    return { ok:true, kind:'LIST', path:'/containers/json?all=false&size=false&filters='+filters, cap:16384 };
  }
  if (route === '/events') {
    if (!only(['since','until','filters']) ||
        ['since','until'].some(key => query.has(key) && !digits(query.get(key))) ||
        (query.has('filters') && !qObject(query.get('filters'))) ||
        !Number.isSafeInteger(nowSec) || nowSec < 0) return deny('EVENT_SCOPE_DENIED');
    const filters = encodeURIComponent(JSON.stringify({type:['container'],container:[id]}));
    return { ok:true, kind:'EVENTS', path:'/events?since='+Math.max(0,nowSec-1)+'&until='+(nowSec+2)+'&filters='+filters, cap:16384 };
  }
  const match = /^\/containers\/([a-f0-9]{64})\/(json|logs)$/.exec(route);
  if (!match || match[1] !== FAKE) return deny('ROUTE_OR_ID_DENIED');
  if (match[2] === 'json') {
    if (keys.length) return deny('QUERY_DENIED');
    return { ok:true, kind:'INSPECT', path:'/containers/'+id+'/json', cap:16384 };
  }
  if (!only(['stdout','stderr','follow','timestamps','since','until','tail']) ||
      keys.some(key => ['stdout','stderr','follow','timestamps'].includes(key) &&
        !['true','false','1','0'].includes(query.get(key))) ||
      ['since','until'].some(key => query.has(key) && !digits(query.get(key)))) return deny('LOG_SCOPE_DENIED');
  const tailInput = query.get('tail');
  if (tailInput !== null && tailInput !== 'all' && !digits(tailInput)) return deny('LOG_TAIL_DENIED');
  const tail = tailInput === null || tailInput === 'all' ? 100 : Number(tailInput);
  if (!Number.isSafeInteger(tail) || tail > 100) return deny('LOG_TAIL_DENIED');
  return { ok:true, kind:'LOGS', path:'/containers/'+id+'/logs?stdout=true&stderr=true&timestamps=true&follow=false&tail='+tail, cap:16384, tail };
}

/** A full-buffer, bounded projection. No response bytes are released before validation succeeds. */
export function projectLabResponse(plan, upstream, id) {
  if (!plan || !plan.ok || !upstream || upstream.status !== 200 ||
      !Buffer.isBuffer(upstream.body) || upstream.body.length > plan.cap) return deny('UPSTREAM_DENIED');
  const data = upstream.body;
  if (plan.kind === 'PING') return data.toString('utf8') === 'OK' ? safe('PING',Buffer.from('OK'),'text/plain') : deny('BODY_DENIED');
  if (plan.kind === 'VERSION') {
    const x=asJson(data);
    return obj(x) && /^1\.(?:4\d|5\d)$/.test(x.ApiVersion) ?
      safe('VERSION',json({ApiVersion:x.ApiVersion})) : deny('BODY_DENIED');
  }
  if (plan.kind === 'LIST') {
    const entries=asJson(data);
    if (!Array.isArray(entries) || entries.length>16) return deny('BODY_DENIED');
    const authorized=[];
    for(const x of entries) {
      if (!obj(x) || !ID.test(x.Id)) return deny('BODY_DENIED');
      if (x.Id===id) authorized.push({Id:FAKE,Names:['/synthetic-allowed'],Image:'synthetic/review-only',Labels:{},Ports:[],State:'running',Status:'Up'});
    }
    if (authorized.length>1) return deny('BODY_DENIED');
    return safe('LIST',json(authorized));
  }
  if (plan.kind === 'INSPECT') {
    const x=asJson(data);
    if (!attestLabContainer(x,id)) return deny('BODY_DENIED');
    return safe('INSPECT',json({Id:FAKE,Name:'/synthetic-allowed',Config:{Image:'synthetic/review-only',Tty:false,Labels:{}},State:{Status:'running',Running:true},HostConfig:{NetworkMode:'none'},Mounts:[]}));
  }
  if (plan.kind === 'EVENTS') {
    let s;
    try {s=utf8.decode(data);}catch{return deny('BODY_DENIED');}
    if (s && !s.endsWith('\n')) return deny('BODY_DENIED');
    const lines=s ? s.slice(0,-1).split('\n') : [];
    if (lines.length>16) return deny('BODY_DENIED');
    const events=[];
    for(const line of lines) {
      let event;
      try {event=JSON.parse(line);}catch{return deny('BODY_DENIED');}
      if (!obj(event) || event.Type!=='container' || !obj(event.Actor) || !ID.test(event.Actor.ID)) return deny('BODY_DENIED');
      if (event.Actor.ID===id) {
        if (!['start','die','pause','unpause'].includes(event.Action)) return deny('BODY_DENIED');
        events.push({Type:'container',Action:event.Action,Actor:{ID:FAKE}});
      }
    }
    return safe('EVENTS',Buffer.from(events.map(e=>JSON.stringify(e)+'\n').join('')),'application/x-ndjson');
  }
  if (plan.kind === 'LOGS') {
    const outputs=[];let position=0;
    while(position<data.length) {
      if (outputs.length>=100 || position+8>data.length) return deny('LOG_FRAME_DENIED');
      const channel=data[position], len=data.readUInt32BE(position+4);
      if (![1,2].includes(channel) || data[position+1]!==0 || data[position+2]!==0 ||
          data[position+3]!==0 || len<1 || len>512 || position+8+len>data.length) return deny('LOG_FRAME_DENIED');
      let line;
      try {line=utf8.decode(data.subarray(position+8,position+8+len));}catch{return deny('LOG_FRAME_DENIED');}
      const m=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z) R6F_PUBLIC_SYNTHETIC_ONLY\n$/.exec(line);
      const parsed = m ? Date.parse(m[1]) : NaN;
      if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,19) !== m[1].slice(0,19)) return deny('LOG_CONTENT_DENIED');
      const body=Buffer.from(m[1]+' '+MARKER+'\n');const header=Buffer.alloc(8);
      header[0]=channel;header.writeUInt32BE(body.length,4);outputs.push(Buffer.concat([header,body]));
      position+=8+len;
    }
    if (outputs.length>plan.tail) return deny('LOG_TAIL_DENIED');
    return safe('LOGS',Buffer.concat(outputs),'application/vnd.docker.multiplexed-stream');
  }
  return deny('ROUTE_DENIED');
}

/** Transport is injected; tests use a fake function, never a Docker endpoint. */
export async function handleLabRead(request, { id, attestation, fetchUpstream, nowSec }) {
  if (!attestLabContainer(attestation,id) || typeof fetchUpstream!=='function') return deny('UNATTESTED_LAB');
  const plan=planLabRead(request,id,nowSec);
  if (!plan.ok) return plan;
  try { return projectLabResponse(plan,await fetchUpstream(plan.path,plan.cap),id); }
  catch { return deny('UPSTREAM_UNAVAILABLE'); }
}
