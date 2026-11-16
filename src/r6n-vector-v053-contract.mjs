/* R6N review-only Vector v0.53.0 protocol-shape contract.
 * All operations are INERT DATA or synthetic pure projections.
 * No socket, Docker client, HTTP server or workflow is wired here.
 */
const ID=/^[0-9a-f]{64}$/;
const NONCE=/^[0-9a-f]{32}$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const REF=/^docker\.io\/library\/busybox@sha256:[0-9a-f]{64}$/;
const ALIAS='a'.repeat(64);
const IMAGE='synthetic/vector-v053-review-only';
const ACTIONS=new Set(['start','die','pause','unpause']);
const invalid=reason=>{throw new Error('R6N_BLOCKED_'+reason)};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function makeR6NFixture({id,nonce,runId,nowSec,imageRef,imageConfigId}={}) {
  if(!ID.test(id??'')||id===ALIAS||!NONCE.test(nonce??'')||
     !Number.isSafeInteger(runId)||runId<1||!Number.isSafeInteger(nowSec)||nowSec<1||
     !REF.test(imageRef??'')||!DIGEST.test(imageConfigId??''))invalid('SPEC');
  const name='r6g-synthetic-'+nonce.slice(0,8);
  return Object.freeze({mode:'R6N_OFFLINE_ONLY',id,nonce,runId,nowSec,imageRef,imageConfigId,
    publicId:ALIAS,name});
}
function spec(s){
  if(!object(s)||s.mode!=='R6N_OFFLINE_ONLY')invalid('SPEC');
  const m=makeR6NFixture(s);
  if(JSON.stringify(s)!==JSON.stringify(m))invalid('SPEC_DRIFT');
  return m;
}
function query(raw){
  const q=new URLSearchParams(raw);
  const entries=[...q.entries()];
  if(entries.length!==new Set(entries.map(e=>e[0])).size||entries.length>8)invalid('QUERY');
  const allowed=(keys)=>{
    if(entries.some(e=>!keys.includes(e[0])))invalid('QUERY');
  };
  return {q,allowed};
}
function since(value,s){
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,10})$/.test(value))invalid('SINCE');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<s.nowSec-600||n>s.nowSec+5)invalid('SINCE');
  return n;
}
function filterObject(raw){
  if(raw===null)return {};
  let parsed;
  try{parsed=JSON.parse(raw);}catch{invalid('FILTERS')}
  if(!object(parsed))invalid('FILTERS');
  const keys=Object.keys(parsed);
  if(keys.some(k=>!['label','type'].includes(k)))invalid('FILTERS');
  if(keys.includes('label')&&JSON.stringify(parsed.label)!==JSON.stringify(['f5.synthetic.lab=R6G_ONLY']))invalid('FILTERS');
  if(keys.includes('type')&&JSON.stringify(parsed.type)!==JSON.stringify(['container']))invalid('FILTERS');
  return parsed;
}
function inert(kind,path,stream=false){return Object.freeze({inert:true,method:'GET',kind,path,stream});}
/** Plans a private Unix GET for the designated synthetic container; no I/O. */
export function planR6NVectorGet(request,rawSpec){
  const s=spec(rawSpec);
  if(!object(request)||request.method!=='GET'||typeof request.target!=='string'||
     request.target.length>2048||!request.target.startsWith('/')||
     request.target.startsWith('//')||request.target.includes('#'))invalid('REQUEST');
  let target=request.target;
  const version=target.match(/^\/v1\.(4[0-9]|5[0-9])(?=\/)/);
  if(version)target=target.slice(version[0].length);
  const i=target.indexOf('?'),pathname=i<0?target:target.slice(0,i);
  if(pathname.includes('%')||pathname.includes('..'))invalid('PATH');
  const {q,allowed}=query(i<0?'':target.slice(i+1));
  if(pathname==='/_ping'||pathname==='/version'){
    allowed([]);return inert(pathname==='/_ping'?'PING':'VERSION',pathname);
  }
  if(pathname==='/containers/json'){
    allowed(['all','size','limit','filters']);
    if(q.get('all')!=='false'||(q.has('size')&&q.get('size')!=='false')||
       (q.has('limit')&&q.get('limit')!=='0'))invalid('LIST');
    const f=filterObject(q.get('filters'));
    if(f.type)invalid('LIST_FILTER');
    return inert('LIST','/containers/json?all=false&size=false&filters='+
      encodeURIComponent(JSON.stringify({id:[s.id]})));
  }
  if(pathname==='/events'){
    allowed(['since','until','filters']);
    const n=since(q.get('since'),s);
    if(q.has('until')&&q.get('until')!=='0')invalid('EVENTS_UNTIL');
    const f=filterObject(q.get('filters'));
    if(f.type&&f.type[0]!=='container')invalid('EVENTS_FILTER');
    return inert('EVENTS','/events?since='+n+'&until=0&filters='+
      encodeURIComponent(JSON.stringify({type:['container'],container:[s.id]})),true);
  }
  if(pathname==='/containers/'+s.publicId+'/json'){
    allowed([]);return inert('INSPECT','/containers/'+s.id+'/json');
  }
  if(pathname==='/containers/'+s.publicId+'/logs'){
    allowed(['follow','stdout','stderr','since','until','timestamps','tail']);
    if(q.get('follow')!=='true'||q.get('stdout')!=='true'||
       q.get('stderr')!=='true'||q.get('timestamps')!=='true'||
       (q.has('tail')&&q.get('tail')!=='all')||
       (q.has('until')&&q.get('until')!=='0'))invalid('LOGS');
    const n=since(q.get('since'),s);
    return inert('LOGS','/containers/'+s.id+'/logs?follow=true&stdout=true&stderr=true&since='+
      n+'&until=0&timestamps=true&tail=all',true);
  }
  invalid('ROUTE');
}
function ownedLabels(labels,s){
  return object(labels)&&labels['f5.synthetic.lab']==='R6G_ONLY'&&
    labels['f5.synthetic.nonce']===s.nonce&&
    labels['f5.synthetic.run']===String(s.runId)&&
    labels['f5.synthetic.role']==='authorized';
}
/** Project only fixed synthetic fields; never expose input IDs or labels. */
export function projectR6NList(rows,rawSpec){
  const s=spec(rawSpec);
  if(!Array.isArray(rows)||rows.length>16)invalid('LIST_DATA');
  const matches=rows.filter(x=>object(x)&&x.Id===s.id);
  if(matches.length>1)invalid('LIST_DUPLICATE');
  if(matches.length===0)return [];
  const x=matches[0];
  if(!Array.isArray(x.Names)||!x.Names.includes('/'+s.name)||!ownedLabels(x.Labels,s))invalid('LIST_ATTESTATION');
  return [{Id:s.publicId,Names:['/'+s.name],Image:IMAGE,
    Labels:{'f5.synthetic.lab':'R6G_ONLY'},State:'running',Status:'Up (synthetic)'}];
}
function validateInspect(raw,s){
  if(!object(raw)||raw.Id!==s.id||raw.Name!=='/'+s.name||
     raw.Image!==s.imageConfigId||!object(raw.Config)||
     raw.Config.Image!==s.imageRef||raw.Config.User!=='10001:10001'||
     raw.Config.Tty!==false||!ownedLabels(raw.Config.Labels,s)||
     !object(raw.State)||raw.State.Running!==true||
     !object(raw.HostConfig)||raw.HostConfig.Privileged!==false||
     raw.HostConfig.NetworkMode!=='none'||raw.HostConfig.ReadonlyRootfs!==true||
     !Array.isArray(raw.HostConfig.CapDrop)||!raw.HostConfig.CapDrop.includes('ALL')||
     !Array.isArray(raw.HostConfig.SecurityOpt)||
     !raw.HostConfig.SecurityOpt.includes('no-new-privileges:true')||
     raw.HostConfig.Memory!==64*1024*1024||raw.HostConfig.NanoCpus!==500000000||
     raw.HostConfig.PidsLimit!==32||!object(raw.HostConfig.RestartPolicy)||
     raw.HostConfig.RestartPolicy.Name!=='no'||raw.HostConfig.AutoRemove!==true||
     !Array.isArray(raw.Mounts)||raw.Mounts.length!==0||
     (raw.HostConfig.Binds!=null&&(!Array.isArray(raw.HostConfig.Binds)||raw.HostConfig.Binds.length!==0))||
     raw.RestartCount!==0||typeof raw.Created!=='string')invalid('INSPECT_ATTESTATION');
  const created=Date.parse(raw.Created);
  if(!Number.isFinite(created)||created<(s.nowSec-600)*1000||
     created>(s.nowSec+5)*1000)invalid('INSPECT_TIME');
}
/** Shape expected by Vector 0.53 ContainerMetadata::from_details; no Rust run. */
export function projectR6NInspect(raw,rawSpec){
  const s=spec(rawSpec);validateInspect(raw,s);
  return {Id:s.publicId,Name:'/'+s.name,
    Created:new Date((s.nowSec-1)*1000).toISOString(),
    Config:{Image:IMAGE,Labels:{'f5.synthetic.lab':'R6G_ONLY',
      'f5.synthetic.nonce':s.nonce},Tty:false,User:'10001:10001'},
    State:{Running:true},HostConfig:{NetworkMode:'none'},Mounts:[]};
}
/** EventMessage requires Action, Actor.ID and Actor.Attributes (not nullable). */
export function projectR6NEvent(raw,rawSpec){
  const s=spec(rawSpec);
  if(!object(raw)||raw.Type!=='container'||!ACTIONS.has(raw.Action)||
     !object(raw.Actor)||raw.Actor.ID!==s.id||
     !object(raw.Actor.Attributes)||raw.Actor.Attributes.name!==s.name||
     !Number.isSafeInteger(raw.time)||raw.time<s.nowSec-600||raw.time>s.nowSec+5)invalid('EVENT_ATTESTATION');
  return {Type:'container',Action:raw.Action,
    Actor:{ID:s.publicId,Attributes:{name:s.name}},
    time:s.nowSec};
}
/** Source-level shape check only, NOT a Rust Vector integration test. */
export function assertR6NVectorShape({list,inspect,event},rawSpec){
  const s=spec(rawSpec);
  if(!Array.isArray(list)||list.length!==1||list[0].Id!==s.publicId||
     !Array.isArray(list[0].Names)||list[0].Names[0]!=='/'+s.name||
     !object(inspect)||inspect.Name!=='/'+s.name||
     typeof inspect.Created!=='string'||!Number.isFinite(Date.parse(inspect.Created))||
     !object(inspect.Config)||typeof inspect.Config.Image!=='string'||
     !object(inspect.Config.Labels)||!object(event)||!ACTIONS.has(event.Action)||
     !object(event.Actor)||event.Actor.ID!==s.publicId||
     !object(event.Actor.Attributes)||event.Actor.Attributes.name!==s.name)invalid('VECTOR_SHAPE');
  return true;
}
