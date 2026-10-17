// Same-UUID gateway. All secrets arrive through private deployment bindings.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
async function mac(key,value){return hex(new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']),encoder.encode(value))));}
const equal=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
export async function handleApi(request,env){
 const fail=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 const origin=env.HARBOR_PUBLIC_ORIGIN,base=env.HARBOR_GAME_BASE,upstream=env.HARBOR_UPSTREAM_ORIGIN,token=env.HARBOR_EDGE_TOKEN,expires=Number(env.HARBOR_EXPIRES_AT);
 const budgetOnly=env.HARBOR_TIME_POLICY==='user-approved-budget-only-20261001'&&env.HARBOR_EXPIRES_AT==='none';
 const verified=env.HARBOR_IDENTITY_MODE==='platform-verified-v1';
 if(origin!=='https://game.aiwaves.tech'||!/^\/[a-f0-9-]{36}$/.test(base??'')||!/^https:\/\/[a-z0-9.-]+$/.test(upstream??'')||!/^[a-f0-9]{64}$/.test(token??'')||!(budgetOnly||(env.HARBOR_TIME_POLICY===undefined&&Number.isSafeInteger(expires)))||!['browser-capability-v1','temporary-unverified','platform-verified-v1'].includes(env.HARBOR_IDENTITY_MODE)||verified&&env.HARBOR_PLATFORM_TOKEN_MODE!=='candidate-token-owner-v1'||!verified&&env.HARBOR_PLATFORM_TOKEN_MODE!==undefined)return fail('PUBLIC_DEPLOYMENT_UNCONFIGURED',503);
 if(!budgetOnly&&Date.now()>=expires)return fail('PLAY_WINDOW_CLOSED',410);
 const demo=env.HARBOR_IDENTITY_MODE==='temporary-unverified';
 const url=new URL(request.url),path=url.pathname;
 const demoRoute=demo&&['/api/account/legacy','/api/account/claim'].includes(path);
 const lifeRead=/^\/api\/sessions\/[a-f0-9-]{36}\/(?:life|land-preview)$/.test(path);
 const clockWrite=/^\/api\/sessions\/[a-f0-9-]{36}\/(?:motion|active-play)$/.test(path);
 const landRead=lifeRead&&path.endsWith('/land-preview');
 const entries=[...url.searchParams],keys=entries.map(([key])=>key);
 const landQuery=landRead&&entries.length<=3&&new Set(keys).size===keys.length&&keys.every(key=>['region','x','y'].includes(key))&&/^[a-z][a-z0-9-]{0,63}$/.test(url.searchParams.get('region')??'')&&url.searchParams.has('x')===url.searchParams.has('y')&&['x','y'].every(key=>!url.searchParams.has(key)||/^-?\d{1,5}(?:\.\d{1,6})?$/.test(url.searchParams.get(key)));
 if(!demoRoute&&!lifeRead&&!clockWrite&&!/^\/api\/(?:health|bootstrap|usage|sessions(?:\/[a-f0-9-]{36}(?:\/(?:action|checkpoint|events|assets\/(?:home|cafe|garden)\/(?:prepare|package|check|manifest|blob)|media\/workshop-annex-[12](?:\/(?:status|prepare))?))?)?)$/.test(path)||clockWrite&&(request.method!=='POST'||url.search)||lifeRead&&request.method!=='GET'||landRead&&!landQuery||!landRead&&url.search&&(lifeRead||!/^\?after=\d{1,12}$/.test(url.search)))return fail('NOT_FOUND',404);
 if(!['GET','POST'].includes(request.method))return fail('METHOD_NOT_ALLOWED',405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return fail('ORIGIN_FORBIDDEN',403);
 if(request.method==='POST'&&(request.headers.get('Origin')!==origin||!request.headers.get('Content-Type')?.startsWith('application/json')))return fail('INVALID_WRITE_ORIGIN',403);
 const name='__Secure-harbor-'+base.slice(1),cookies=(request.headers.get('Cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 let owner=path==='/api/health'?'0'.repeat(64):null,setCookie;
 if(!verified&&cookies.length===1){const [id,signature,...extra]=cookies[0].slice(name.length+1).split('.');if(!extra.length&&/^[a-f0-9]{64}$/.test(id??'')&&/^[a-f0-9]{64}$/.test(signature??'')&&equal(signature,await mac(token,'harbor-v1:'+base+':'+id)))owner=id;}
 // Internal prototype: the live host ID selects the existing unverified account scope.
 // This is not browser possession or platform authentication; retain the private edge boundary.
 if(demo&&path!=='/api/health'){
  const id=request.headers.get('X-Harbor-Telegram-Id');
  if(id===null)return fail('PLATFORM_LOGIN_REQUIRED',401);
  if(!/^[1-9][0-9]{0,19}$/.test(id)||request.headers.get('X-Harbor-Identity-Mode')!=='temporary-unverified')return fail('INVALID_DEMO_IDENTITY',400);
  owner=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(['harbor-owner-v1',base.slice(1),'telegram-unverified-v1',id])))));
 }
 if(verified&&path!=='/api/health'){
  const id=request.headers.get('X-Harbor-Telegram-Id'),bearer=request.headers.get('Authorization');
  if(id===null||bearer===null)return fail('PLATFORM_TOKEN_REQUIRED',401);
  if(!/^[1-9][0-9]{0,19}$/.test(id)||request.headers.get('X-Harbor-Identity-Mode')!=='platform-verified-v1')return fail('PLATFORM_ID_INVALID',400);
  if(!/^Bearer [\x21-\x7e]{1,4096}$/.test(bearer))return fail('PLATFORM_TOKEN_REQUIRED',401);
  // The backend verifies token ownership before deriving the legacy account
  // owner. This fixed edge placeholder is never an authenticated user claim.
  owner='0'.repeat(64);
 }
 if(!owner){if(path!=='/api/bootstrap'||request.method!=='POST')return fail('PLAYER_SESSION_REQUIRED',401);owner=hex(crypto.getRandomValues(new Uint8Array(32)));}
 if(!demo&&!verified&&path==='/api/bootstrap'&&request.method==='POST')setCookie=name+'='+owner+'.'+await mac(token,'harbor-v1:'+base+':'+owner)+'; Path='+base+'/; Secure; HttpOnly; SameSite=Strict; Max-Age='+(budgetOnly?2592000:Math.min(31536000,Math.floor((expires-Date.now())/1000)));
 const bodyLimit=clockWrite||path.includes('/assets/')?16384:1500000;
 let body;
 if(request.method==='POST'){
  if(Number(request.headers.get('Content-Length'))>bodyLimit)return fail('BODY_TOO_LARGE',413);
  const reader=request.body?.getReader();if(!reader)return fail('INVALID_JSON',400);const chunks=[];let size=0;
  try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.byteLength;if(size>bodyLimit){await reader.cancel();return fail('BODY_TOO_LARGE',413)}chunks.push(x.value)}}finally{reader.releaseLock()}
  body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length}
 }
 const headers=new Headers({'X-Harbor-Edge':token,'X-Harbor-Owner':owner,'Origin':origin,'X-Harbor-Game':base.slice(1)});if(body)headers.set('Content-Type','application/json');
 if(request.headers.get('X-Harbor-Dynamic-Assets')==='1')headers.set('X-Harbor-Dynamic-Assets','1');
 // Public save-format capability, not identity or permission. Do not upgrade
 // clients that omitted it or forward unknown/combined header values.
 if(request.headers.get('X-Harbor-Land')==='2')headers.set('X-Harbor-Land','2');
 if(demo){const id=request.headers.get('X-Harbor-Telegram-Id');if(id!==null){if(!/^[1-9][0-9]{0,19}$/.test(id)||request.headers.get('X-Harbor-Identity-Mode')!=='temporary-unverified')return fail('INVALID_DEMO_IDENTITY',400);headers.set('X-Harbor-Telegram-Id',id);headers.set('X-Harbor-Identity-Mode','temporary-unverified')}}
 if(verified&&path!=='/api/health'){headers.set('X-Harbor-Telegram-Id',request.headers.get('X-Harbor-Telegram-Id'));headers.set('X-Harbor-Identity-Mode','platform-verified-v1');headers.set('Authorization',request.headers.get('Authorization'))}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
 try{const r=await fetch(upstream+base+path+url.search,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.any([controller.signal,request.signal])});if(r.status>=300&&r.status<400)return fail('UPSTREAM_REDIRECT_REFUSED',502);const out=new Headers({'Content-Type':r.headers.get('Content-Type')??'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(r.headers.get('X-Consumer-Grant'))out.set('X-Consumer-Grant',r.headers.get('X-Consumer-Grant'));if(setCookie&&r.ok)out.set('Set-Cookie',setCookie);return new Response(r.body,{status:r.status,headers:out})}catch{return fail('SERVICE_UNAVAILABLE',503)}finally{clearTimeout(timer)}
}
