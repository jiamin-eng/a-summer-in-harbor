/** Reuse bounded scene-owned render resources while their source textures stay shared. */
export function createSceneResourceCache<T extends {reusable:boolean}>(
 create:(scene:string)=>T,
 detach:(value:T)=>void,
 destroy:(value:T)=>void,
 alive:(value:T)=>boolean=()=>true,
){
 const saved=new Map<string,T>();
 let current:{scene:string;value:T}|undefined;
 const release=()=>{
  if(!current)return;
  const {scene,value}=current;current=undefined;detach(value);
  if(value.reusable&&alive(value)){const previous=saved.get(scene);if(previous)destroy(previous);saved.set(scene,value)}
  else destroy(value);
 };
 return{
  enter(scene:string){
   if(current?.scene===scene&&alive(current.value))return current.value;
   release();let value=saved.get(scene);saved.delete(scene);
   if(value&&!alive(value)){destroy(value);value=undefined}
   current={scene,value:value??create(scene)};return current.value;
  },
  leave:release,
  dispose(){release();for(const value of saved.values())destroy(value);saved.clear();current=undefined},
  cachedScenes:()=>[...saved.keys()],
 };
}
