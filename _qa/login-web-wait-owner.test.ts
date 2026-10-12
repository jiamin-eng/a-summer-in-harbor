import test from 'node:test';
import assert from 'node:assert/strict';

test('existing guest Web wins over parent fallback and human OTP remains unbounded beyond host timeout',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 let webCalls=0,parentCalls=0,settled=false;
 const win:any={location:{search:'?api_origin=https%3A%2F%2Ffixture.invalid',origin:'https://game.aiwaves.tech'},addEventListener(){},removeEventListener(){},parent:{postMessage(){parentCalls++}},Aigram:{isInAigram:true,isGuestWeb:true,__alteruGuestTransportPatched:true,telegramId:'',callAigramAPI(){webCalls++;return new Promise(()=>{})}}};
 (globalThis as any).window=win;(globalThis as any).document={querySelector:()=>({})};
 try{
  const {signInToPlatform}=await import('../src/account-link/platform-login');
  const pending=signInToPlatform();pending.then(()=>{settled=true},()=>{settled=true});
  await new Promise(r=>setTimeout(r,11200));assert.equal(settled,false);assert.equal(webCalls,1);assert.equal(parentCalls,0);
  win.Aigram.telegramId='710711';assert.equal(await pending,'710711');
 }finally{(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument}
});

test('WK precedence over a simultaneously present Web function remains the original contract',async()=>{
 const oldWindow=(globalThis as any).window,oldDocument=(globalThis as any).document;
 let nativeCalls=0,webCalls=0;
 const win:any={location:{search:'?api_origin=https%3A%2F%2Ffixture.invalid',origin:'https://game.aiwaves.tech'},addEventListener(){},removeEventListener(){},Aigram:{isInAigram:true,telegramId:'',callAigramAPI(){webCalls++;return Promise.resolve({retcode:0})}}};win.parent=win;
 win.webkit={messageHandlers:{aigram:{postMessage(message:string){nativeCalls++;const envelope=JSON.parse(Buffer.from(message.slice(8),'base64').toString());win.Aigram.telegramId='710712';win['__aigram_cb_'+envelope.request_id.replaceAll('-','_')](JSON.stringify({request_id:envelope.request_id,success:true,data:{retcode:0}}))}}}};
 (globalThis as any).window=win;(globalThis as any).document={querySelector:()=>null};
 try{const {signInToPlatform}=await import('../src/account-link/platform-login');assert.equal(await signInToPlatform(),'710712');assert.equal(nativeCalls,1);assert.equal(webCalls,0)}
 finally{(globalThis as any).window=oldWindow;(globalThis as any).document=oldDocument}
});
