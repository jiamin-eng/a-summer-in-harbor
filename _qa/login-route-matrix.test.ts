import {test} from 'node:test';import assert from 'node:assert/strict';
test('isolated transport matrix: named WK, nested parent, delay, missing bridge, invalid envelope/origin, timeout, logout and recovery',async()=>{
 const old=(globalThis as any).window,od=(globalThis as any).document;const events=new Map<string,Function>();let count=0,handler:(message:string)=>void=()=>{};
 const w:any={location:{search:'?telegram_id=710701&api_origin=https%3A%2F%2Ffixture.invalid',origin:'https://game.aiwaves.tech'},addEventListener:(k:string,f:Function)=>events.set(k,f),removeEventListener:(k:string)=>events.delete(k)};
 const reset=(frame=false,id='')=>{w.Aigram={isInAigram:true,telegramId:id};delete w.webkit;w.parent=frame?{postMessage:(m:string)=>{count++;handler(m)}}:w;count=0;events.clear()};
 const native=()=>{w.webkit={messageHandlers:{aigram:{postMessage:(m:string)=>{count++;handler(m)}}}}};
 const env=(m:string)=>JSON.parse(Buffer.from(m.slice(8),'base64').toString());
 const wkReply=(e:any,data:any={retcode:0})=>w['__aigram_cb_'+e.request_id.replaceAll('-','_')]?.(JSON.stringify({request_id:e.request_id,success:true,data}));
 const postReply=(e:any,origin='https://fixture.invalid',request_id=e.request_id)=>events.get('message')?.({origin,data:'callAPIResult-'+Buffer.from(JSON.stringify({request_id,success:true,data:{retcode:0}})).toString('base64')});
 (globalThis as any).window=w;(globalThis as any).document={querySelector:()=>null};reset();
 try{const {signInToPlatform}=await import('../src/account-link/platform-login');const {liveShellAccount,identitySnapshot}=await import('../src/account-link/transport');
 reset(false,'710702');native();assert.equal(await signInToPlatform(),'710702');assert.equal(count,0);
 reset(true,'710703');assert.equal(await signInToPlatform(),'710703');assert.equal(count,0);
 reset(true);w.Aigram.isGuestWeb=true;w.Aigram.__alteruGuestTransportPatched=true;w.Aigram.callAigramAPI=()=>{w.Aigram.telegramId='710709';return Promise.resolve({retcode:0})};assert.equal(await signInToPlatform(),'710709');assert.equal(count,0,'existing guest web transport retains precedence over parent fallback');
 reset();native();handler=m=>{const e=env(m);wkReply(e)};await assert.rejects(signInToPlatform(),/PLATFORM_ID_UNAVAILABLE/);assert.equal(liveShellAccount(),null,'stats reply never invents ID');
 reset();native();handler=m=>{const e=env(m);const cb=w['__aigram_cb_'+e.request_id.replaceAll('-','_')];cb('bad-json');cb(JSON.stringify({request_id:'unrelated',success:true,data:{telegram_id:'710999'}}));setTimeout(()=>{assert.equal(liveShellAccount(),null);w.Aigram.telegramId='710704';wkReply(e)},20)};assert.equal(await signInToPlatform(),'710704');assert.equal(count,1);assert.equal(events.size,0);
 reset(true);handler=m=>{const e=env(m);postReply(e,'https://attacker.invalid');postReply(e,'https://fixture.invalid','unrelated');events.get('message')?.({origin:'https://fixture.invalid',data:'callAPIResult-not-base64'});setTimeout(()=>{assert.equal(liveShellAccount(),null);w.Aigram.telegramId='710705';postReply(e)},20)};const nested=signInToPlatform();assert.equal(signInToPlatform(),nested);assert.equal(await nested,'710705');assert.equal(count,1);assert.equal(events.size,0);
 reset();handler=m=>{const e=env(m);w.Aigram.telegramId='710706';wkReply(e)};const delayed=signInToPlatform();setTimeout(native,150);assert.equal(await delayed,'710706');assert.equal(count,1);
 const s=identitySnapshot();w.Aigram.isInAigram=false;assert.equal(liveShellAccount(),null);assert.throws(s.assert,/IDENTITY_CHANGED/);w.Aigram={isInAigram:true,telegramId:''};assert.equal(liveShellAccount(),null);w.Aigram.telegramId='__alteru_guest__';assert.equal(liveShellAccount(),null);w.Aigram.telegramId='bad';assert.equal(liveShellAccount(),'__invalid_shell_identity__');
 reset(true);handler=m=>postReply(env(m),'https://attacker.invalid');await assert.rejects(signInToPlatform(),/PLATFORM_LOGIN_UNAVAILABLE|timeout/);assert.equal(liveShellAccount(),null);await new Promise(r=>setTimeout(r,40));assert.equal(events.size,0,'wrong source does not complete canonical request; timeout removes listener');
 reset();native();handler=()=>{};await assert.rejects(signInToPlatform(),/PLATFORM_LOGIN_UNAVAILABLE|timeout/);await new Promise(r=>setTimeout(r,40));assert.equal(events.size,0,'WK timeout cleans up');
 reset();await assert.rejects(signInToPlatform(),/PLATFORM_LOGIN_UNAVAILABLE/);assert.equal(liveShellAccount(),null);assert.equal(count,0,'no bridge and no ID never dispatches');
 reset(false,'710707');await assert.rejects(signInToPlatform(),/PLATFORM_LOGIN_UNAVAILABLE/);assert.equal(count,0);assert.equal(liveShellAccount(),null,'top-level numeric identity without transport stays rejected');
 reset();native();handler=m=>{const e=env(m);w.Aigram.telegramId='710708';wkReply(e)};assert.equal(await signInToPlatform(),'710708','retry after timeout is available');
 }finally{(globalThis as any).window=old;(globalThis as any).document=od}
});
