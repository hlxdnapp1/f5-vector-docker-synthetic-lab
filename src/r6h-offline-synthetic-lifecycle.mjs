/* Public R6H review-only: an IN-MEMORY lifecycle simulator.
 * No Docker API, process, child process, socket, network or filesystem access.
 * It cannot provision, start, remove or inspect real containers.
 */
const OWNER = 'hlxdnapp1/f5-vector-docker-synthetic-lab';
const NONCE = /^[a-f0-9]{32}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{64}$/;
const SYNTHETIC_IDS = Object.freeze({ authorized:'c'.repeat(64), outsider:'d'.repeat(64) });
const ROLES = Object.freeze(['authorized','outsider']);
const deepCopy = x => structuredClone(x);
const stop = code => { throw Error('R6H_BLOCKED_' + code); };

export function makeR6HManifest({owner,nonce,imageDigest,runId,nowSec} = {}) {
  if (owner !== OWNER || typeof nonce !== 'string' || !NONCE.test(nonce) ||
      typeof imageDigest !== 'string' || !DIGEST.test(imageDigest) ||
      imageDigest === 'sha256:'+'0'.repeat(64) ||
      !Number.isSafeInteger(runId) || runId < 1 ||
      !Number.isSafeInteger(nowSec) || nowSec < 1) stop('MANIFEST');
  const containers = ROLES.map((role, index) => Object.freeze({
    role,
    mockId:SYNTHETIC_IDS[role],
    name:role === 'authorized' ? 'r6g-synthetic-'+nonce.slice(0,8) :
      'r6h-outsider-'+nonce.slice(8,16),
    imageDigest,
    labels:Object.freeze({'f5.synthetic.lab':'R6H_MOCK_ONLY','f5.synthetic.nonce':nonce,
      'f5.synthetic.run':String(runId),'f5.synthetic.role':role}),
    user:'10001:10001',
    networkMode:'none',
    privileged:false,
    readOnlyRootfs:true,
    mounts:Object.freeze([]),
    capDrop:Object.freeze(['ALL']),
    noNewPrivileges:true,
    memoryBytes:64*1024*1024,
    nanoCpus:500000000,
    pidsLimit:32,
    restartPolicy:'no',
    autoRemove:true,
    createdSec:nowSec+index
  }));
  return Object.freeze({schema:1,mode:'IN_MEMORY_SIMULATION_ONLY',owner,nonce,
    runId,nowSec,imageDigest,containers:Object.freeze(containers)});
}

function verifyManifest(m) {
  if (!m || m.schema !== 1 || m.mode !== 'IN_MEMORY_SIMULATION_ONLY' ||
      !Array.isArray(m.containers) || m.containers.length !== 2) stop('SCOPE');
  const expected=makeR6HManifest({owner:m.owner,nonce:m.nonce,
    imageDigest:m.imageDigest,runId:m.runId,nowSec:m.nowSec});
  if (JSON.stringify(m) !== JSON.stringify(expected)) stop('DRIFT');
  return expected;
}

// Private brand prevents attaching arbitrary transports to this simulation.
export class OfflineFakeDocker {
  #brand = 'R6H_IN_MEMORY_ONLY';
  #objects = new Map();
  #trace = [];
  #failOnCreate = null;
  #failOnRemove = null;
  static isOfflineFake(value) { return value instanceof OfflineFakeDocker && #brand in value; }
  injectFailure({createRole=null,removeId=null}={}) {
    if (createRole !== null && !ROLES.includes(createRole)) stop('FAULT_ROLE');
    if (removeId !== null && !ID.test(removeId)) stop('FAULT_ID');
    this.#failOnCreate=createRole;
    this.#failOnRemove=removeId;
  }
  seedForeignForTest() {
    const id='e'.repeat(64);
    this.#objects.set(id,{id,foreign:true});
    return id;
  }
  createFromManifest(spec) {
    if (!ROLES.includes(spec?.role) || !ID.test(spec.mockId) ||
        SYNTHETIC_IDS[spec.role] !== spec.mockId ||
        this.#failOnCreate === spec.role) stop('SIMULATED_CREATE');
    const current=this.#objects.get(spec.mockId);
    if (current) {
      if (JSON.stringify(current.spec)!==JSON.stringify(spec)) stop('COLLISION');
      return current.id;
    }
    this.#objects.set(spec.mockId,{id:spec.mockId,spec:deepCopy(spec)});
    this.#trace.push({op:'FAKE_CREATE',role:spec.role,id:spec.mockId});
    return spec.mockId;
  }
  removeExactOwned(id,nonce,runId) {
    if (!ID.test(id) || !Object.values(SYNTHETIC_IDS).includes(id)) stop('UNKNOWN_ID');
    const current=this.#objects.get(id);
    if (!current) return false;
    if (!current.spec || current.spec.labels['f5.synthetic.nonce'] !== nonce ||
        current.spec.labels['f5.synthetic.run'] !== String(runId)) stop('NOT_OWNED');
    if (this.#failOnRemove === id) stop('SIMULATED_REMOVE');
    this.#objects.delete(id);
    this.#trace.push({op:'FAKE_REMOVE',id});
    return true;
  }
  snapshot() { return deepCopy([...this.#objects.values()]); }
  trace() { return deepCopy(this.#trace); }
}

/** Fail closed: record exact owned IDs; simulated cleanup never deletes anything else. */
export function createR6HOfflineController(manifest,driver) {
  const fixed=verifyManifest(manifest);
  if (!OfflineFakeDocker.isOfflineFake(driver)) stop('REAL_TRANSPORT_FORBIDDEN');
  let phase='NEW';
  const owned=[];
  const create=()=>{
    if (phase==='CLEANED') stop('ALREADY_CLEANED');
    if (phase==='ACTIVE') return {phase,created:owned.length};
    phase='CREATING';
    try {
      for (const spec of fixed.containers) {
        const id=driver.createFromManifest(spec);
        if (id!==spec.mockId) stop('CREATED_ID_MISMATCH');
        owned.push(id);
      }
      phase='ACTIVE';
      return {phase,created:owned.length};
    } catch (error) {
      phase='FAILED';
      throw error;
    }
  };
  const cleanup=()=>{
    if (phase==='CLEANED') return {phase,remaining:0};
    if (phase==='NEW') {phase='CLEANED';return {phase,remaining:0};}
    if (!['ACTIVE','FAILED','CLEANUP_FAILED'].includes(phase)) stop('INVALID_PHASE');
    phase='CLEANUP_RUNNING';
    try {
      for (const id of [...owned].reverse()) {
        driver.removeExactOwned(id,fixed.nonce,fixed.runId);
        owned.splice(owned.indexOf(id),1);
      }
      phase='CLEANED';
      return {phase,remaining:0};
    } catch (error) {
      phase='CLEANUP_FAILED';
      throw error;
    }
  };
  return Object.freeze({create,cleanup,status:()=>({phase,ownedIds:[...owned]})});
}
