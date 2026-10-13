/** Start independent loads together; retain the same readiness/error contract. */
export async function prepareSceneAssets(tasks:(()=>Promise<unknown>)[]){
 await Promise.all(tasks.map(task=>task()));
}
