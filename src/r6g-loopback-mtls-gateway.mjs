/* R6G Draft: dormant loopback-only HTTPS mTLS gateway candidate.
 * Does not start on import. No embedded keys or certificates. A separately
 * approved hosted-runner launch would supply ephemeral TLS material in RAM.
 * This is not a live-streaming Vector collector; bounded snapshots only.
 */
import { createServer } from 'node:https';
import { checkHostedRunnerGate } from './r6f-unix-transport.mjs';
import { executeR6GAttestedRead } from './r6g-reconciled-read.mjs';

const HEX_FP = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const HOST = /^(?:localhost|127\.0\.0\.1)(?::[1-9][0-9]{0,4})?$/;
const denyHeaders = new Set(['authorization','proxy-authorization','x-forwarded-for',
  'x-forwarded-host','forwarded','x-real-ip','upgrade','expect']);

/** Validate external in-memory certificates, never read disk or secrets. */
export function r6gTlsOptions(input) {
  if (!input || !Buffer.isBuffer(input.key) || !Buffer.isBuffer(input.cert) ||
      !Buffer.isBuffer(input.ca) || input.key.length < 64 ||
      input.cert.length < 64 || input.ca.length < 64 ||
      !HEX_FP.test(input.clientFingerprint ?? '')) throw Error('R6G_TLS_MATERIAL_REQUIRED');
  return Object.freeze({
    key:input.key, cert:input.cert, ca:input.ca,
    requestCert:true, rejectUnauthorized:true,
    minVersion:'TLSv1.3', maxVersion:'TLSv1.3',
    handshakeTimeout:5000, honorCipherOrder:true
  });
}

/** Mandatory independent TLS peer + HTTP request gate before any probe. */
export function r6gClientRequestAllowed(info, expectedFingerprint) {
  if (!info || !HEX_FP.test(expectedFingerprint ?? '') ||
      info.authorized !== true || info.fingerprint256 !== expectedFingerprint ||
      info.remoteAddress !== '127.0.0.1' || info.method !== 'GET' ||
      !HOST.test(info.host ?? '') ||
      typeof info.url !== 'string' || info.url.length > 2048 ||
      !info.url.startsWith('/') || info.url.startsWith('//') ||
      !Number.isSafeInteger(info.headerCount) || info.headerCount > 24 ||
      !Array.isArray(info.headerNames) ||
      info.headerNames.some(name=>denyHeaders.has(name)) ||
      info.hasRequestBody === true) return false;
  return true;
}

/** Requires approved runner, ephemeral TLS material and injected read-only transport.
 * Returns a start()/stop() capability; the raw server is not exposed. */
export function makeR6GLoopbackGateway({env,spec,tls,fetchUpstream}) {
  if (!checkHostedRunnerGate(env) || !spec ||
      typeof fetchUpstream !== 'function') throw Error('R6G_RUNNER_GATE_DENIED');
  const options=r6gTlsOptions(tls);
  let started=false;
  const server=createServer(options,async(req,res)=>{
    const cert=req.socket.getPeerCertificate();
    const names=Object.keys(req.headers);
    const info={
      authorized:req.socket.authorized,
      fingerprint256:cert?.fingerprint256,
      remoteAddress:req.socket.remoteAddress,
      method:req.method,host:req.headers.host,url:req.url,
      headerCount:req.rawHeaders.length/2,headerNames:names,
      hasRequestBody:Object.hasOwn(req.headers,'content-length') ||
        Object.hasOwn(req.headers,'transfer-encoding')
    };
    const respond=(code,body,type='text/plain')=>{
      if(res.headersSent||res.destroyed)return;
      res.writeHead(code,{'Content-Type':type,'Content-Length':body.length,
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Connection':'close'});
      res.end(body);
    };
    if(!r6gClientRequestAllowed(info,tls.clientFingerprint)) {
      respond(403,Buffer.from('DENIED'));
      return;
    }
    const result=await executeR6GAttestedRead({env,request:{method:req.method,target:req.url},
      spec,fetchUpstream});
    if(!result.ok){respond(403,Buffer.from('DENIED'));return;}
    if(!Buffer.isBuffer(result.body)||result.body.length>32768) {
      respond(500,Buffer.from('DENIED'));return;
    }
    respond(200,result.body,result.contentType || 'application/octet-stream');
  });
  server.headersTimeout=4500;
  server.requestTimeout=4500;
  server.keepAliveTimeout=1000;
  server.maxRequestsPerSocket=5;
  server.on('tlsClientError',()=>{});
  return Object.freeze({
    start:async()=>{
      if(started)throw Error('R6G_ALREADY_STARTED');
      started=true;
      try {
        await new Promise((resolve,reject)=>{
          server.once('error',reject);
          server.listen(0,'127.0.0.1',()=>{
            server.removeListener('error',reject);resolve();
          });
        });
        const address=server.address();
        return Object.freeze({ host:'127.0.0.1',port:address.port });
      }catch{started=false;throw Error('R6G_LISTEN_FAILED');}
    },
    stop:async()=>{
      if(!started)return;
      await new Promise(resolve=>server.close(()=>resolve()));
      started=false;
    }
  });
}
