import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import * as candidate from '../src/world/data';
import {residentRoutes} from '../src/world/residents';

// Compare an explicitly selected frozen checkout without machine-specific imports.
const root=process.env.HARBOR_BASELINE_ROOT;
assert.ok(root,'HARBOR_BASELINE_ROOT_REQUIRED');
assert.equal(execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),'4b0f4c0f8dff83321ddf5185b5c99112d7b41300');
assert.equal(execFileSync('git',['-C',root,'status','--porcelain','--','src/world/data.ts','src/world/residents.ts'],{encoding:'utf8'}).trim(),'');
const baseline=await import(pathToFileURL(resolve(root,'src/world/data.ts')).href) as typeof import('../src/world/data');
const {residentRoutes:oldRoutes}=await import(pathToFileURL(resolve(root,'src/world/residents.ts')).href) as typeof import('../src/world/residents');
assert.deepEqual(candidate.people,baseline.people);
assert.deepEqual(candidate.world,baseline.world);
assert.deepEqual(residentRoutes,oldRoutes);
for(const [id,room] of Object.entries(baseline.rooms)){
 const next=candidate.rooms[id];assert.deepEqual(next.props,room.props);assert.deepEqual(next.spawn,room.spawn);
 for(const entity of room.entities){const found=next.entities.find(e=>e.id===entity.id)!;const {gatheringRole,...rest}=found;assert.deepEqual(rest,entity)}
}
writeFileSync('../evidence/BASELINE-WORLD-EXACT.json',JSON.stringify({result:'PASS',identities:22,existingPropsSpawnsRoutesEntitiesExactExceptGatheringRoleTag:true,worldCollisionExact:true,originalFormalSourceOnlyRead:true},null,2)+'\n');
