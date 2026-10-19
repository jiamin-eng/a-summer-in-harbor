import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import {createAnimalPhase2Preview} from '../server/animal-phase2-preview';
import first from '../server/content/reviewed-evening-gull-watch.json';
import second from '../server/content/phase2-quiet-after-gulls.json';
import {playStory} from './animal-m3-playthrough';

test('loopback phase-two entrance uses a synthetic session, normal HTTP action and no external model or player storage',async()=>{
 const clock={value:100000};
 const preview=await createAnimalPhase2Preview({port:0,now:()=>clock.value,motionWait:async(ms)=>{clock.value+=ms}});
 const port=(preview.address as AddressInfo).port,base=`http://127.0.0.1:${port}`;
 const originalFetch=globalThis.fetch;let externalCalls=0;
 globalThis.fetch=((input:any,init?:any)=>{
  if(!String(input).startsWith(base)){externalCalls++;throw Error('EXTERNAL_NETWORK_FORBIDDEN')}
  return originalFetch(input,init);
 }) as typeof fetch;
 try{
  const forbidden=await fetch(base+'/api/sessions');assert.equal(forbidden.status,401);
  const bootstrap=await fetch(base+'/api/bootstrap',{method:'POST'});
  assert.equal(bootstrap.status,200);assert.equal((await bootstrap.json()).modelCallsAllowed,false);
  const cookie=bootstrap.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('harbor_phase2_preview='));
  let requests=0,transportResets=0;
  const request=async(path:string,method='GET',body?:unknown)=>{
   requests++;
   let response:Response;
   const input={method,headers:{Cookie:cookie!,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})};
   for(let attempt=0;;attempt++){
    try{response=await fetch(base+path,input);break}catch(error:any){
     const code=String(error?.cause?.code??error?.code??'UNKNOWN');
     if(code==='ECONNRESET'&&attempt<3){transportResets++;continue}
     throw Error(`PREVIEW_HTTP_TRANSPORT_${method}_${path.split('/').at(-1)}_${code}_REQUEST_${requests}`);
    }
   }
   const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
  };
  const head=await request('/api/sessions','POST',{enrollment_id:randomUUID(),locale:'en'});
  assert.equal(head.scene,'coast');assert.ok(head.id);
  const before=await request(`/api/sessions/${head.id}/life`);
  assert.equal(before.animals.commissions.some((c:any)=>c.ref.id===first.ref.id),true);
  assert.equal(before.animals.commissions.some((c:any)=>c.ref.id===second.ref.id),false);
  const action={action_id:randomUUID(),expected_version:head.version,scene:head.scene,position:head.position,
   target:'home',action:'travel-map'};
  const moved=await request(`/api/sessions/${head.id}/action`,'POST',action);
  assert.equal(moved.head.scene,'home');
  assert.equal((await request(`/api/sessions/${head.id}`)).version,moved.head.version);
  assert.equal((await request(`/api/sessions/${head.id}/life`)).animals.commissions.some((c:any)=>c.ref.id===second.ref.id),false);
  const throughHttp={
   get:(_who:string,id:string)=>request(`/api/sessions/${id}`),
   action:(_who:string,id:string,command:unknown)=>request(`/api/sessions/${id}/action`,'POST',command),
   motion:(_who:string,id:string,command:unknown)=>request(`/api/sessions/${id}/motion`,'POST',command),
   activePlay:(_who:string,id:string,command:unknown)=>request(`/api/sessions/${id}/active-play`,'POST',command),
  };
  const chapterOne=await playStory(throughHttp,preview.assembly,'preview-only',moved.head,first.groundedChoice as any,clock);
  assert.equal((await request(`/api/sessions/${head.id}/life`)).animals.commissions.some((c:any)=>c.ref.id===second.ref.id),true);
  const chapterTwo=await playStory(throughHttp,preview.assembly,'preview-only',chapterOne.head,second.groundedChoice as any,clock);
  assert.equal(chapterTwo.head.animalNotebookV1.pages.filter((p:any)=>p.ref.id===second.ref.id).length,1);
  assert.equal(chapterTwo.head.relations.dani,(head.relations.dani??0)+2);
  assert.deepEqual(chapterTwo.head.items,head.items);assert.equal(chapterTwo.head.cash,head.cash);
  assert.equal(externalCalls,0);
  assert.ok(transportResets<=3);
 }finally{globalThis.fetch=originalFetch;await preview.close()}
});
