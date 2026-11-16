/* R6I: OFFLINE REVIEW-ONLY Docker Engine lifecycle contract.
 * This file generates plans and checks fabricated evidence. It has NO transport,
 * no sockets, no Docker CLI, no filesystem writes, and never executes operations.
 * Even its POST/DELETE descriptions are INERT DATA. Do not connect to a daemon.
 */
const OWNER = 'hlxdnapp1/f5-vector-docker-synthetic-lab';
const NONCE = /^[a-f0-9]{32}$/;
const HEXID = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const IMAGE = /^docker\.io\/library\/busybox@sha256:[a-f0-9]{64}$/;
const ROLE = new Set(['authorized', 'outsider']);
const MAX_MEMORY = 64 * 1024 * 1024;
const CAP = 500_000_000;
const PIDS = 32;
const safe = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stop = kind => { throw Error('R6I_BLOCKED_' + kind); };
const redacted = value => JSON.parse(JSON.stringify(value));

/** Immutable, exact configuration contract. The manifest digest and image config
 * ID are different Docker concepts; their equality is neither required nor assumed.
 * The image MUST be preapproved and already present on an isolated runner. */
export function makeR6IWorkload({owner,nonce,runId,nowSec,imageRef,imageConfigId}={}) {
  if (owner !== OWNER || !NONCE.test(nonce ?? '') ||
      !Number.isSafeInteger(runId) || runId < 1 ||
      !Number.isSafeInteger(nowSec) || nowSec < 1 ||
      !IMAGE.test(imageRef ?? '') || !DIGEST.test(imageConfigId ?? '') ||
      imageConfigId === 'sha256:' + '0'.repeat(64)) stop('MANIFEST');
  const specs = ['authorized','outsider'].map((role) => ({
    role,
    name: role === 'authorized' ? 'r6g-synthetic-' + nonce.slice(0,8) :
      'r6i-outsider-' + nonce.slice(8,16),
    labels: {
      'f5.synthetic.lab': role === 'authorized' ? 'R6G_ONLY' : 'R6I_OUTSIDER_ONLY',
      'f5.synthetic.nonce': nonce,
      'f5.synthetic.run': String(runId),
      'f5.synthetic.role': role
    },
  }));
  return Object.freeze({schema:1,mode:'OFFLINE_OPERATION_PLAN_ONLY',owner,nonce,runId,
    nowSec,imageRef,imageConfigId,roles:Object.freeze(specs.map(x=>Object.freeze(x)))});
}

function exactWorkload(workload) {
  if (!safe(workload) || workload.schema !== 1 ||
      workload.mode !== 'OFFLINE_OPERATION_PLAN_ONLY' || !Array.isArray(workload.roles)) stop('PLAN_SCOPE');
  const expected = makeR6IWorkload(workload);
  if (JSON.stringify(workload) !== JSON.stringify(expected)) stop('PLAN_DRIFT');
  return expected;
}

/** Validate local image cache proof before a later, separately approved
 * POST create. Docker inspect.Id (config digest) differs from RepoDigests
 * (manifest digests). Do not silently equate them. */
export function verifyR6IImageInspect(workload, raw) {
  const m = exactWorkload(workload);
  return safe(raw) && raw.Id === m.imageConfigId &&
    Array.isArray(raw.RepoDigests) && raw.RepoDigests.includes(m.imageRef) &&
    raw.Os === 'linux' && raw.Architecture === 'amd64' &&
    Array.isArray(raw.RootFS?.Layers) && raw.RootFS.Layers.length > 0;
}

function specFor(workload,role) {
  const m = exactWorkload(workload);
  if (!ROLE.has(role)) stop('ROLE');
  return {m,container:m.roles.find(x=>x.role===role)};
}

/** Container configuration is an exact proposed POST body, not an operation. */
export function makeR6ICreateBody(workload,role) {
  const {m,container} = specFor(workload,role);
  const marker='R6F_PUBLIC_SYNTHETIC_ONLY';
  return {
    Image:m.imageRef, User:'10001:10001', Tty:false, OpenStdin:false,
    // This intended command requires review against the digest-pinned busybox image.
    Cmd:['sh','-c',"while :; do printf '%s\\n' '"+marker+"'; sleep 1; done"],
    Labels:{...container.labels},
    HostConfig:{
      Privileged:false, NetworkMode:'none', ReadonlyRootfs:true,
      CapDrop:['ALL'], SecurityOpt:['no-new-privileges:true'],
      Memory:MAX_MEMORY, NanoCpus:CAP, PidsLimit:PIDS,
      RestartPolicy:{Name:'no'}, AutoRemove:true,
      Binds:[], Mounts:[], PublishAllPorts:false,
    }
  };
}

/** Each operation is data: no connection or request method is invoked. */
export function planR6IOperation(workload,role,operation,{id=null,imageInspect=null,inspectProof=null,journal=null}={}) {
  const {m,container}=specFor(workload,role);
  const expectedId = id;
  const needsId=new Set(['inspect','start','stop','delete']);
  if (needsId.has(operation) && (!HEXID.test(expectedId ?? '') || expectedId === 'a'.repeat(64))) stop('TARGET_ID');
  const state = journal?.mode==='OFFLINE_JOURNAL_PLAN_ONLY' && journal?.nonce===m.nonce &&
    journal?.runId===m.runId ? journal.roles?.[role] : null;
  const precondition = (phases,matchId=true) => !!state && phases.includes(state.phase) &&
    (!matchId || state.id===expectedId);
  const wrap=(method,path,body=null)=>Object.freeze({inert:true,method,path,body});
  switch(operation) {
    case 'image-inspect':
      return wrap('GET','/images/'+encodeURIComponent(m.imageRef)+'/json');
    case 'recover-by-owner': {
      if (!precondition(['RECOVERY_REQUIRED'],false)) stop('RECOVERY_LEDGER');
      const filters=encodeURIComponent(JSON.stringify({label:[
        'f5.synthetic.nonce='+m.nonce,
        'f5.synthetic.run='+m.runId,
        'f5.synthetic.role='+role
      ]}));
      return wrap('GET','/containers/json?all=true&filters='+filters);
    }
    case 'create':
      if (!precondition(['CREATE_INTENT'],false)) stop('CREATE_LEDGER');
      if (!verifyR6IImageInspect(m,imageInspect)) stop('IMAGE_NOT_ATTESTED');
      return wrap('POST','/containers/create?name='+encodeURIComponent(container.name),makeR6ICreateBody(m,role));
    case 'inspect':
      if (!precondition(['NEEDS_INSPECT','ATTESTED','ACTIVE','CLEANUP_INTENT','CLEANUP_BLOCKED'])) stop('INSPECT_LEDGER');
      return wrap('GET','/containers/'+expectedId+'/json');
    case 'start':
      if (!precondition(['ATTESTED']) || !verifyR6IContainerInspect(m,role,id,inspectProof)) stop('START_LEDGER_OR_PROOF');
      return wrap('POST','/containers/'+expectedId+'/start');
    case 'stop':
      if (!precondition(['CLEANUP_INTENT']) || !verifyR6IContainerInspect(m,role,id,inspectProof,{requireRunning:true})) stop('STOP_LEDGER_OR_PROOF');
      return wrap('POST','/containers/'+expectedId+'/stop?t=3');
    case 'delete':
      if (!precondition(['CLEANUP_INTENT']) || !verifyR6IContainerInspect(m,role,id,inspectProof) || inspectProof.State.Running) stop('DELETE_LEDGER_OR_PROOF');
      return wrap('DELETE','/containers/'+expectedId+'?force=false&v=false');
    default: return stop('UNKNOWN_OPERATION');
  }
}

/** Validate inspect evidence *before* start/stop/removal. The proof is supplied
 * by a fake transport today, NOT a trustworthy real Docker daemon. */
export function verifyR6IContainerInspect(workload,role,id,raw,{requireRunning=false}={}) {
  const {m,container}=specFor(workload,role);
  const b=makeR6ICreateBody(m,role);
  const gotLabels=raw?.Config?.Labels;
  const expectedLabels=container.labels;
  const labelsMatch=safe(gotLabels) && Object.keys(gotLabels).length===Object.keys(expectedLabels).length &&
    Object.entries(expectedLabels).every(([key,value])=>gotLabels[key]===value);
  if (!HEXID.test(id ?? '') || id === 'a'.repeat(64) || !safe(raw) || raw.Id !== id ||
      raw.Name !== '/'+container.name || raw.Image !== m.imageConfigId ||
      !safe(raw.Config) || raw.Config.Image !== m.imageRef || raw.Config.User !== b.User ||
      raw.Config.Tty !== false || !safe(raw.Config.Labels) ||
      !labelsMatch ||
      !safe(raw.HostConfig) || raw.HostConfig.Privileged !== false ||
      raw.HostConfig.NetworkMode !== 'none' || raw.HostConfig.ReadonlyRootfs !== true ||
      !Array.isArray(raw.HostConfig.CapDrop) || !raw.HostConfig.CapDrop.includes('ALL') ||
      !Array.isArray(raw.HostConfig.SecurityOpt) ||
      !raw.HostConfig.SecurityOpt.includes('no-new-privileges:true') ||
      raw.HostConfig.Memory !== MAX_MEMORY || raw.HostConfig.NanoCpus !== CAP ||
      raw.HostConfig.PidsLimit !== PIDS || !safe(raw.HostConfig.RestartPolicy) ||
      raw.HostConfig.RestartPolicy.Name !== 'no' || raw.HostConfig.AutoRemove !== true ||
      !Array.isArray(raw.Mounts) || raw.Mounts.length !== 0 ||
      !safe(raw.State) || typeof raw.State.Running !== 'boolean' ||
      (requireRunning && raw.State.Running !== true) ||
      raw.RestartCount !== 0 || typeof raw.Created !== 'string') return false;
  const created=Date.parse(raw.Created);
  return Number.isFinite(created) && created <= (m.nowSec + 5)*1000 &&
    created >= (m.nowSec - 600)*1000;
}

/** Recover ambiguous POST/create without ever blindly issuing a second POST.
 * Multi-match, unknown ID, or mismatched inspect => BLOCKED. */
export function verifyR6IRecovery(workload,role,listing,inspected) {
  specFor(workload,role);
  if (!Array.isArray(listing) || listing.length > 1) return Object.freeze({status:'BLOCKED',id:null});
  if (listing.length === 0) return Object.freeze({status:'ABSENT_UNCONFIRMED',id:null});
  const id=listing[0]?.Id;
  if (typeof id !== 'string' || !HEXID.test(id) ||
      !verifyR6IContainerInspect(workload,role,id,inspected)) return Object.freeze({status:'BLOCKED',id:null});
  return Object.freeze({status:'RECOVERED',id});
}

/** Persist *every return value* before dispatching its suggested operation.
 * This reducer never writes a file; a future real runner needs an atomic durable journal.
 * A timeout after CREATE requires recovery-by-owner; it must never re-create blindly.
 */
export function makeR6IJournal(workload) {
  const m=exactWorkload(workload);
  return {schema:1,mode:'OFFLINE_JOURNAL_PLAN_ONLY',runId:m.runId,nonce:m.nonce,
    roles:{authorized:{phase:'PLANNED',id:null},outsider:{phase:'PLANNED',id:null}}};
}
export function advanceR6IJournal(workload,journal,role,event,evidence=null) {
  const m=exactWorkload(workload);
  if (!safe(journal) || journal.schema!==1 || journal.mode!=='OFFLINE_JOURNAL_PLAN_ONLY' ||
      journal.runId!==m.runId || journal.nonce!==m.nonce || !ROLE.has(role) ||
      !safe(journal.roles) || !safe(journal.roles[role])) stop('JOURNAL');
  const current=journal.roles[role];
  const next=redacted(journal);
  let phase,id=current.id;
  if (event==='intent-create' && current.phase==='PLANNED') phase='CREATE_INTENT';
  else if (event==='create-uncertain' && current.phase==='CREATE_INTENT') phase='RECOVERY_REQUIRED';
  else if (event==='created' && current.phase==='CREATE_INTENT' &&
           HEXID.test(evidence?.id ?? '') && evidence.id!=='a'.repeat(64)) {
    phase='NEEDS_INSPECT';id=evidence.id;
  }
  else if (event==='recovered' && current.phase==='RECOVERY_REQUIRED' &&
           evidence?.status==='RECOVERED' && HEXID.test(evidence.id)) {
    phase='NEEDS_INSPECT';id=evidence.id;
  }
  else if (event==='attested' && current.phase==='NEEDS_INSPECT' &&
           verifyR6IContainerInspect(m,role,id,evidence)) phase='ATTESTED';
  else if (event==='started' && current.phase==='ATTESTED' &&
           verifyR6IContainerInspect(m,role,id,evidence,{requireRunning:true})) phase='ACTIVE';
  else if (event==='intent-cleanup' && ['NEEDS_INSPECT','ATTESTED','ACTIVE','CLEANUP_BLOCKED'].includes(current.phase) &&
           verifyR6IContainerInspect(m,role,id,evidence)) phase='CLEANUP_INTENT';
  else if (event==='cleanup-failed' && current.phase==='CLEANUP_INTENT') phase='CLEANUP_BLOCKED';
  else if (event==='absent-verified' && current.phase==='CLEANUP_INTENT' &&
           evidence?.inspectStatus===404 && evidence?.matchingOwnerListCount===0) {
    phase='CLEANED';id=null;
  }
  else stop('TRANSITION');
  next.roles[role]={phase,id};
  return next;
}
