/* Public R6G REVIEW ONLY: an offline-tested, fail-closed inspection boundary.
 * No socket opened here; the injected fetch must be a separately reviewed,
 * hosted-only Unix GET transport. No containers are created or changed.
 */
import { planLabRead, projectLabResponse } from './r6f-real-docker-adapter.mjs';
import { checkHostedRunnerGate, isBoundedUnixGet } from './r6f-unix-transport.mjs';

const ID = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const NONCE = /^[a-f0-9]{32}$/;
const MAX_PROOF = 16384;
const MAX_AGE_SEC = 600;
const MAX_MEMORY = 128 * 1024 * 1024;
const safeObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const denied = reason => ({ ok: false, kind: reason, body: null, contentType: null });
const pinnedProof = obj => ({
  Id:obj.Id, Image:obj.Image, Created:obj.Created, Name:obj.Name,
  Label:obj.Config.Labels['f5.synthetic.nonce'],
  Memory:obj.HostConfig.Memory, NanoCpus:obj.HostConfig.NanoCpus,
  PidsLimit:obj.HostConfig.PidsLimit
});

/** This is defense-in-depth, not cryptographic proof of a host/daemon identity. */
export function verifyR6GSyntheticContainer(value, spec) {
  if (!safeObject(spec) || !ID.test(spec.id ?? '') ||
      spec.id === 'a'.repeat(64) || !DIGEST.test(spec.imageId ?? '') ||
      !NONCE.test(spec.nonce ?? '') || !Number.isSafeInteger(spec.nowSec) ||
      spec.nowSec < 0 || !safeObject(value) || value.Id !== spec.id ||
      value.Image !== spec.imageId ||
      !/^\/r6g-synthetic-[a-f0-9]{8}$/.test(value.Name ?? '') ||
      typeof value.Created !== 'string' ||
      !safeObject(value.Config) || !safeObject(value.Config.Labels) ||
      value.Config.Labels['f5.synthetic.lab'] !== 'R6G_ONLY' ||
      value.Config.Labels['f5.synthetic.nonce'] !== spec.nonce ||
      value.Config.Tty !== false || value.Config.User !== '10001:10001' ||
      !safeObject(value.HostConfig) || value.HostConfig.Privileged !== false ||
      value.HostConfig.NetworkMode !== 'none' ||
      value.HostConfig.ReadonlyRootfs !== true ||
      !Array.isArray(value.HostConfig.CapDrop) || !value.HostConfig.CapDrop.includes('ALL') ||
      !Array.isArray(value.HostConfig.SecurityOpt) ||
      !value.HostConfig.SecurityOpt.includes('no-new-privileges:true') ||
      !Number.isSafeInteger(value.HostConfig.Memory) ||
      value.HostConfig.Memory < 16 * 1024 * 1024 || value.HostConfig.Memory > MAX_MEMORY ||
      !Number.isSafeInteger(value.HostConfig.NanoCpus) ||
      value.HostConfig.NanoCpus < 100_000_000 || value.HostConfig.NanoCpus > 1_000_000_000 ||
      !Number.isSafeInteger(value.HostConfig.PidsLimit) ||
      value.HostConfig.PidsLimit < 1 || value.HostConfig.PidsLimit > 64 ||
      !safeObject(value.HostConfig.RestartPolicy) ||
      value.HostConfig.RestartPolicy.Name !== 'no' ||
      value.HostConfig.AutoRemove !== true ||
      !Array.isArray(value.Mounts) || value.Mounts.length !== 0 ||
      (value.HostConfig.Binds !== null && value.HostConfig.Binds !== undefined &&
       (!Array.isArray(value.HostConfig.Binds) || value.HostConfig.Binds.length !== 0)) ||
      !safeObject(value.State) || value.State.Running !== true ||
      !Number.isInteger(value.RestartCount) || value.RestartCount !== 0) return null;
  const created = Date.parse(value.Created);
  if (!Number.isFinite(created) || Math.abs(created - spec.nowSec * 1000) > MAX_AGE_SEC * 1000 ||
      created > (spec.nowSec + 5) * 1000) return null;
  return pinnedProof(value);
}

function decodeInspection(upstream, spec) {
  if (!safeObject(upstream) || upstream.status !== 200 ||
      !Buffer.isBuffer(upstream.body) || upstream.body.length < 2 ||
      upstream.body.length > MAX_PROOF) return null;
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(upstream.body)); }
  catch { return null; }
  return verifyR6GSyntheticContainer(value, spec);
}

/** Bounded, atomic response release only after a fresh pre- and post-inspection. */
export async function executeR6GAttestedRead({ env, request, spec, fetchUpstream }) {
  if (!checkHostedRunnerGate(env) || !safeObject(spec) ||
      typeof fetchUpstream !== 'function') return denied('RUNTIME_GATE_DENIED');
  const {id, nowSec} = spec;
  const plan = planLabRead(request, id, nowSec);
  if (!plan.ok) return denied('REQUEST_DENIED');
  const path = '/containers/' + id + '/json';
  if (!isBoundedUnixGet(path,id,MAX_PROOF,nowSec) ||
      !isBoundedUnixGet(plan.path,id,plan.cap,nowSec)) return denied('UPSTREAM_SCOPE_DENIED');
  try {
    const before = decodeInspection(await fetchUpstream(path,MAX_PROOF),spec);
    if (before === null) return denied('PRE_ATTESTATION_DENIED');
    const data = await fetchUpstream(plan.path,plan.cap);
    if (!safeObject(data) || data.status !== 200 ||
        !Buffer.isBuffer(data.body) || data.body.length > plan.cap) return denied('UPSTREAM_DENIED');
    const after = decodeInspection(await fetchUpstream(path,MAX_PROOF),spec);
    if (after === null || JSON.stringify(before) !== JSON.stringify(after))
      return denied('POST_ATTESTATION_DENIED');
    // R6F's historical inspect projector expects an R6F-only label/name;
    // R6G attestation uses an intentionally distinct R6G-only identity.
    // Never reflect the raw inspect object; emit fixed synthetic fields only.
    if (plan.kind === 'INSPECT') {
      const dataProof = decodeInspection(data,spec);
      if (dataProof === null || JSON.stringify(dataProof) !== JSON.stringify(before))
        return denied('INSPECT_BODY_DENIED');
      return {ok:true,kind:'INSPECT',contentType:'application/json',body:Buffer.from(JSON.stringify({
        Id:'a'.repeat(64),Name:'/synthetic-allowed',
        Config:{Image:'synthetic/review-only',Tty:false,Labels:{}},
        State:{Status:'running',Running:true},
        HostConfig:{NetworkMode:'none'},Mounts:[]
      }))};
    }
    const sanitized = projectLabResponse(plan,data,id);
    if (!sanitized.ok || !Buffer.isBuffer(sanitized.body)) return denied('RESPONSE_DENIED');
    return sanitized;
  } catch {
    return denied('PROBE_UNAVAILABLE');
  }
}
