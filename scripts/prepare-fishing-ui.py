#!/usr/bin/env python3
"""Prepare only. Never starts HTTP, a browser, a port, or the generated host."""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess

def prepare():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('lane');ap.add_argument('mode',choices=['open','stop-new'])
    ap.add_argument('--build',default='build-final');ap.add_argument('--check-only',action='store_true')
    ap.add_argument('--node',default=shutil.which('node'))
    a=ap.parse_args();root=Path(__file__).resolve().parents[2];source=root/'source';build=(root/a.build).resolve()
    if not a.node:raise RuntimeError('EXISTING_NODE_REQUIRED')
    if Path(a.lane).name!=a.lane or a.lane in ['.','..']:raise RuntimeError('NEW_LANE_NAME_REQUIRED')
    disk=os.statvfs(root)
    if disk.f_bavail*disk.f_frsize<15*1024**3:raise RuntimeError('DISK_GATE_BELOW_15_GIB')
    m=json.loads((build/'MANIFEST.json').read_text());git=lambda *args:subprocess.check_output(['git','-C',str(source),*args],text=True).strip()
    if git('rev-parse','HEAD')!=m['commit'] or git('rev-parse','HEAD^{tree}')!=m['tree'] or git('status','--porcelain'):raise RuntimeError('SOURCE_BUILD_IDENTITY_MISMATCH')
    variant=m['variants'][a.mode];backend=build/a.mode/'backend';front=build/a.mode/'frontend';qa=backend/'qa-runtime.mjs'
    digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    if digest(qa)!=variant['backend']['qaRuntimeSha256'] or digest(front/variant['frontend']['mainJs'])!=variant['frontend']['sha256']:raise RuntimeError('COMPILED_INPUT_HASH_MISMATCH')
    # Pure module/handler/rule checks only: never call makeDemoServer or listen.
    probe="""const q=await import(process.argv[1]);let status,body;const handled=q.fishingClientContract({url:'/api/client-contract',method:'GET',headers:{}},{writeHead:n=>status=n,end:b=>body=JSON.parse(b)});if(!handled||status!==200||body.mode!==q.FISHING_MODE||body.fishingProtocol!==q.FISHING_PROTOCOL||body.fishingRelease!==q.FISHING_RELEASE)throw Error('COMPILED_CONTRACT_MISMATCH');const r=q.createRuntime(),s=r.initial('en','00000000-0000-4000-8000-000000000001');let allowed=false;try{await r.prepare(s,{action_id:'00000000-0000-4000-8000-000000000002',expected_version:s.version,scene:s.scene,position:s.position,target:'fishing-kit',action:'fishing-kit:claim'});allowed=true}catch(e){if(e.message!=='FISHING_NEW_STARTS_CLOSED')throw e}if(allowed!==(q.FISHING_MODE==='open'))throw Error('COMPILED_ADMISSION_MODE_MISMATCH');console.log(JSON.stringify({contract:body,mode:q.FISHING_MODE,newStartsAllowed:allowed,node:process.version,pure:true,listenersStarted:0,browsersStarted:0}));"""
    verified=json.loads(subprocess.check_output([a.node,'--input-type=module','-e',probe,qa.as_uri()],text=True))
    if verified['mode']!=a.mode or variant['sourceRelease']!=m['release']+':'+a.mode or verified['contract']['fishingRelease']!=m['release']:raise RuntimeError('FRONTEND_CONTRACT_RUNTIME_MODE_MISMATCH')
    origin=root.parent/'fishing-recovery-20261021/ui-recovery-r2/main-host.mts';host=origin.read_text()
    substitutions={
      "import {makeDemoServer} from './source/_qa/temporary-account-server.ts';":"import {makeDemoServer,createExplorationAssembly,createReviewedAnimalLife,createReviewedAnimalArcLife,withWildMint,withBasilPlantUses,initial,FISHING_MODE,fishingContract} from './compiled-backend/qa-runtime.mjs';",
      "import {createExplorationAssembly} from './source/server/exploration-assembly.ts';":"",
      "import {createReviewedAnimalLife,createReviewedAnimalArcLife} from './source/server/reviewed-animal-life.ts';":"",
      "import {withWildMint} from './source/server/wild-mint.ts';":"",
      "import {withBasilPlantUses} from './source/server/plant-basil.ts';":"",
      "import {initial} from './source/src/story/state.ts';":"",
    }
    for old,new in substitutions.items():
      if host.count(old)!=1:raise RuntimeError('FROZEN_HOST_IMPORT_DRIFT '+old)
      host=host.replace(old,new,1)
    host=host.replace("'X-Harbor-Fern':'1'","'X-Harbor-Fern':'1','X-Harbor-Fishing':'2'")
    marker="const actualReplayRef=identity.version;"
    guard="const qaExpected=identity.expectedContract;if(identity.mode!==FISHING_MODE||JSON.stringify(fishingContract())!==JSON.stringify(qaExpected))throw Error('COMPILED_QA_MODE_PIN_MISMATCH');writeFileSync('reports/compiled-mode-at-boot.json',JSON.stringify({candidate:identity.version,mode:FISHING_MODE,contract:fishingContract()}));"
    if host.count(marker)!=1:raise RuntimeError('FROZEN_HOST_PIN_DRIFT')
    host=host.replace(marker,marker+guard,1)
    marker="qaBootMark('artifact_pin_complete');"
    # Runs only when the parent later authorizes a supervised dynamic launch.
    live="const qaContractResponse=await originalFetch(apiServer.url+'/'+GAME_UUID+'/api/client-contract',{headers:{'X-Harbor-Telegram-Id':'98765001','X-Harbor-Identity-Mode':'platform-verified-v1','Authorization':'Bearer '+qaTokenFor('98765001'),'X-Harbor-Fishing':'2'}});const qaLiveContract=await qaContractResponse.json();if(!qaContractResponse.ok||JSON.stringify(qaLiveContract)!==JSON.stringify(identity.expectedContract))throw Error('ACTUAL_HTTP_CONTRACT_MODE_MISMATCH');writeFileSync('reports/actual-http-contract.json',JSON.stringify(qaLiveContract));"
    if host.count(marker)!=1:raise RuntimeError('FROZEN_HOST_ARTIFACT_DRIFT')
    host=host.replace(marker,marker+live,1)
    if 'fishingNewStarts:false' in host or 'fishingNewStarts:true' in host:raise RuntimeError('SOURCE_ONLY_MODE_OVERRIDE_FORBIDDEN')
    summary={'candidate':m['commit'],'tree':m['tree'],'build':str(build),'mode':a.mode,'frontend':variant['frontend'],'qaRuntimeSha256':variant['backend']['qaRuntimeSha256'],'compiledCheck':verified,'hostSource':str(origin),'hostSHA256':hashlib.sha256(host.encode()).hexdigest(),'dynamicStarted':False}
    if a.check_only:print(json.dumps(summary));return
    lane=root/a.lane
    if lane.exists():raise RuntimeError('NEW_LANE_REQUIRED')
    lane.mkdir()
    for n,t in [('source',source),('node_modules',source/'node_modules'),('frozen-dist',front),('compiled-backend',backend)]: (lane/n).symlink_to(t.resolve(),target_is_directory=True)
    for n in ['reports','fixtures','evidence']:(lane/n).mkdir()
    files=subprocess.check_output(['git','-C',str(source),'ls-files','-z']).decode().split('\0')
    (lane/'reports/SOURCE-INTAKE.json').write_text(json.dumps({'productCommit':m['commit'],'files':[{'path':f,'sha256':digest(source/f)}for f in files if f and (source/f).is_file()]}))
    (lane/'reports/artifact-manifest.json').write_text(json.dumps({'source':m['commit'],'files':[{'path':str(f.relative_to(front)),'sha256':digest(f)}for f in front.rglob('*')if f.is_file()]}))
    (lane/'reports/candidate-identity.json').write_text(json.dumps({'version':m['commit'],'actualBackendCode':m['commit'],'mode':a.mode,'expectedContract':verified['contract'],'buildDirectory':'frozen-dist','bundleName':variant['frontend']['mainJs'].split('/')[-1]}))
    (lane/'reports/COMPILED-MODE-CHECK.json').write_text(json.dumps(summary,indent=2)+'\n');(lane/'main-host.mts').write_text(host)
    (lane/'NOT-STARTED.txt').write_text('Prepared metadata only. No HTTP/Chrome/port startup. Parent authorization and existing resource/child-cleanup supervision required before any dynamic execution.\n')
    print(json.dumps({**summary,'lane':str(lane)}))
if __name__=='__main__':prepare()
