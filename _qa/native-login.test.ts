import {test} from 'node:test';
import assert from 'node:assert/strict';
test('native live injection, logout, delayed callback and concurrent login use canonical WK transport',async()=>{
 const old=(globalThis as any).window;const listeners=new Map<string,Function>();let calls=0;
 const w:any={location:{search:'?telegram_id=999999',origin:'http://localhost'},addEventListener:(k:string,f:Function)=>listeners.set(k,f),removeEventListener:(k:string)=>listeners.delete(k)};w.parent=w;
 (globalThis as any).window=w;
 try{
  const {liveShellAccount,identitySnapshot}=await import('../src/account-link/transport');
  const {signInToPlatform}=await import('../src/account-link/platform-login');
  w.Aigram={isInAigram:true,telegramId:'999999'};assert.equal(liveShellAccount(),null,'query-only shell is not a native account');
  w.webkit={messageHandlers:{aigram:{postMessage:(message:string)=>{
   calls++;assert.match(message,/^callAPI-/);const envelope=JSON.parse(Buffer.from(message.slice(8),'base64').toString());assert.equal(envelope.method,'GET');
   setTimeout(()=>{w.Aigram={telegramId:'710001'};w['__aigram_cb_'+envelope.request_id.replace(/-/g,'_')](JSON.stringify({request_id:envelope.request_id,success:true,data:{retcode:0}}))},150);
  }}}};
  w.Aigram={telegramId:'710002'};assert.equal(liveShellAccount(),'710002');const snapshot=identitySnapshot();
  w.Aigram.isInAigram=false;assert.equal(liveShellAccount(),null);assert.throws(snapshot.assert,/IDENTITY_CHANGED/);
  w.Aigram={telegramId:'__alteru_guest__'};assert.equal(liveShellAccount(),null);
  const p=signInToPlatform();assert.equal(signInToPlatform(),p);assert.equal(await p,'710001');assert.equal(calls,1);assert.equal(listeners.size,0);
  assert.equal(await signInToPlatform(),'710001');assert.equal(calls,1);
  w.Aigram={telegramId:''};assert.equal(liveShellAccount(),null,'logout must not revive launch ID');
  w.Aigram={telegramId:'710002'};assert.equal(liveShellAccount(),'710002','return publishes new live identity');
 }finally{(globalThis as any).window=old}
});
