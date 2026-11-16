/* Dormant, guarded transport candidate for an isolated GitHub-hosted Linux lab.
 * NO call is made at import time. No mutation verbs, TCP, container creation,
 * Docker CLI, or HML endpoints. Not wired to the Draft workflow.
 */
import { request as httpRequest } from 'node:http';
import { statSync } from 'node:fs';

const ID=/^[a-f0-9]{64}$/;
const REPO='hlxdnapp1/f5-vector-docker-synthetic-lab';

export function checkHostedRunnerGate(env) {
  if (!env || env.GITHUB_ACTIONS!=='true' || env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
      env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main' ||
      env.RUNNER_ENVIRONMENT!=='github-hosted' || env.RUNNER_OS!=='Linux' ||
      env.R6F_REAL_DOCKER_APPROVAL!=='EXPLICIT_SEPARATE_OWNER_APPROVAL' ||
      typeof env.GITHUB_SHA!=='string' || !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA) ||
      env.R6F_APPROVED_COMMIT!==env.GITHUB_SHA ||
      env.DOCKER_HOST || env.DOCKER_CONTEXT || env.DOCKER_TLS_VERIFY ||
      env.DOCKER_CERT_PATH) return false;
  return true;
}

/** An additional mandatory path-level gate, independent from the planner. */
export function isBoundedUnixGet(path, id, maxBytes, nowSec) {
  if (!ID.test(id) || id==='a'.repeat(64) || !Number.isInteger(maxBytes) ||
      maxBytes<1 || maxBytes>32768 || typeof path!=='string' || path.length>1024) return false;
  if (path==='/_ping' || path==='/version' || path==='/containers/'+id+'/json')return true;
  if (path==='/containers/'+id+'/logs?stdout=true&stderr=true&timestamps=true&follow=false&tail=0')return true;
  const log=path.match(/^\/containers\/([a-f0-9]{64})\/logs\?stdout=true&stderr=true&timestamps=true&follow=false&tail=(\d{1,3})$/);
  if (log) return log[1]===id && Number(log[2])<=100;
  if (!path.startsWith('/containers/json?') && !path.startsWith('/events?')) return false;
  const [route,raw]=path.split('?');
  if (!raw || raw.includes('#'))return false;
  const q=new URLSearchParams(raw);
  const keys=[...q.keys()];
  if (keys.length!==new Set(keys).size)return false;
  if(route==='/containers/json') {
    if(keys.length!==3 || q.get('all')!=='false' || q.get('size')!=='false')return false;
    try { const v=JSON.parse(q.get('filters')); return JSON.stringify(v)===JSON.stringify({id:[id]}); }catch{return false;}
  }
  if (route==='/events') {
    if(keys.length!==3 || !Number.isSafeInteger(nowSec) || nowSec<0 ||
        !/^\d{1,11}$/.test(q.get('since')||'') || !/^\d{1,11}$/.test(q.get('until')||'')) return false;
    const since=Number(q.get('since')),until=Number(q.get('until'));
    if (since>nowSec || until>nowSec+5 || until<since || nowSec-since>5)return false;
    try {return JSON.stringify(JSON.parse(q.get('filters')))===JSON.stringify({type:['container'],container:[id]});}catch{return false;}
  }
  return false;
}

/** Deliberately impossible to call with a remote TCP endpoint. */
export function createHostedUnixRead({env, id, socketPath='/var/run/docker.sock', now=()=>Math.floor(Date.now()/1000)}) {
  if (!checkHostedRunnerGate(env) || !ID.test(id) || id==='a'.repeat(64) ||
      socketPath!=='/var/run/docker.sock' || !statSync(socketPath).isSocket()) {
    throw Error('R6F_BLOCKED_RUNNER_OR_SOCKET');
  }
  return async function boundedRead(path,maxBytes) {
    if (!isBoundedUnixGet(path,id,maxBytes,now())) throw Error('R6F_BLOCKED_UPSTREAM_PATH');
    return new Promise((resolve,reject)=>{
      const req=httpRequest({socketPath,method:'GET',path,agent:false,
        headers:{Host:'docker',Connection:'close',Accept:'application/json'}},res=>{
        if (res.statusCode!==200) {res.resume();resolve({status:res.statusCode,body:Buffer.alloc(0)});return;}
        const chunks=[];let total=0;
        res.on('data',chunk=>{
          total+=chunk.length;
          if(total>maxBytes){req.destroy(Error('R6F_UPSTREAM_LIMIT'));return;}
          chunks.push(chunk);
        });
        res.on('end',()=>resolve({status:200,body:Buffer.concat(chunks)}));
        res.on('error',()=>reject(Error('R6F_UPSTREAM_INTERRUPTED')));
        res.on('aborted',()=>reject(Error('R6F_UPSTREAM_ABORTED')));
      });
      req.setTimeout(4500,()=>req.destroy(Error('R6F_UPSTREAM_TIMEOUT')));
      req.on('error',()=>reject(Error('R6F_UNIX_READ_FAILURE')));
      req.end();
    });
  };
}
