/** Build only; never imports/runs public.ts or contacts a service. */
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,relative,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=process.argv[2];
if(!out)throw Error('EXPLICIT_NEW_OUTPUT_DIRECTORY_REQUIRED');
const destination=resolve(out);await mkdir(destination,{recursive:false});
const entry=resolve('server/public.ts'),source=await readFile(entry,'utf8');
const marker='const assembly=createExplorationAssembly({';
if(source.split(marker).length!==2)throw Error('EXACT_ASSEMBLY_CALL_REQUIRED');
const stopped=source.replace(marker,marker+'ornamentalFernStarts:false,');
const sha=s=>createHash('sha256').update(s).digest('hex');
for(const [name,contents] of [['backend-enabled',source],['backend-stop-new-fern',stopped]]){
 const folder=join(destination,name);await mkdir(join(folder,'news'),{recursive:true});
 await build({entryPoints:[entry],outfile:join(folder,'public.mjs'),bundle:true,platform:'node',format:'esm',target:'node22',external:['pg-native'],plugins:[
  {name:'exact-assembly-variant',setup(b){b.onLoad({filter:/\/server\/public\.ts$/},()=>({contents,loader:'ts',resolveDir:dirname(entry)}))}},
  {name:'preserve-rule-runtime',setup(b){b.onResolve({filter:/vendor\/dynamic-runtime/},a=>({path:'./'+relative(root,resolve(a.resolveDir,a.path)),external:true}))}},
 ],banner:{js:"import { createRequire as harborCreateRequire } from 'node:module'; const require = harborCreateRequire(import.meta.url);"}});
 await copyFile('server/news/frozen-catalog-20261006.json',join(folder,'news/frozen-catalog-20261006.json'));
 await writeFile(join(folder,'BUILD-IDENTITY.json'),JSON.stringify({variant:name,sourceEntry:'server/public.ts',sourceSha256:sha(source),effectiveEntrySha256:sha(contents),onlyVariantChange:name==='backend-enabled'?null:'ornamentalFernStarts:false',bundleSha256:sha(await readFile(join(folder,'public.mjs'))),externalRuntime:'Existing vendor/dynamic-runtime; all vendor and dependency inputs unchanged from ebc',notExecuted:true},null,2)+'\n');
}
await writeFile(join(destination,'public-stop-new.ts'),stopped);
const line=source.slice(0,source.indexOf(marker)).split('\n').length,oldLine=source.split('\n')[line-1],newLine=stopped.split('\n')[line-1];
await writeFile(join(destination,'stop-new-fern.patch'),`--- a/server/public.ts\n+++ b/server/public.ts\n@@ -${line} +${line} @@\n-${oldLine}\n+${newLine}\n`);
console.log(JSON.stringify({destination,variants:['backend-enabled','backend-stop-new-fern'],executed:false}));
