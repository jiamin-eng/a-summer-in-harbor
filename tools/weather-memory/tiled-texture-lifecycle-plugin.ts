/** @canvasengine/presets 2.2.0 TiledMap owns the TileSet frame views it creates.
 * Dispose those views on replacement/unmount; preserve the cached image source.
 * The effect cleanup also handles a tileset load resolving after unmount. */
export function tiledTextureLifecyclePlugin(){return{name:'isolated-tiled-texture-lifecycle',enforce:'pre' as const,transform(code:string,id:string){if(!id.endsWith('/@canvasengine/presets/dist/index.js'))return null;const original=`\ts(async () => {
\t\tlet e = n();
\t\tif (e) {
\t\t\tf = await m(e, r()), d = [];
\t\t\tfor (let e of f.tilesets) e.tile && (e.tiles = e.tile), e.tiles ||= [], d.push(await new mn(e).load(e.image.source));
\t\t\tlet t = f.layers;
\t\t\ti() && (t = hn(f.layers, d, f)), o.set(t);
\t\t}
\t});`;if(!code.includes(original))throw Error('TILED_TEXTURE_LIFECYCLE_TARGET_MISMATCH');const replacement=`
 const ownedTileSets=new Set();let disposed=false,revision=0;
 const releaseSet=tileset=>{tileset.textures.forEach(texture=>texture.destroy(false));tileset.textures.length=0;ownedTileSets.delete(tileset)};
 const release=()=>{disposed=true;revision++;[...ownedTileSets].forEach(releaseSet)};
 s(async()=>{
  const value=n(),basePath=r(),splitLayers=i(),generation=++revision;
  if(value&&!disposed){
   const parsed=await m(value,basePath),next=[];
   for(const definition of parsed.tilesets){
    definition.tile&&(definition.tiles=definition.tile);definition.tiles||=[];
    const tileset=await new mn(definition).load(definition.image.source);
    ownedTileSets.add(tileset);next.push(tileset);
   }
   if(disposed||generation!==revision){next.forEach(releaseSet);return release}
   const previous=d;f=parsed;d=next;
   o.set(splitLayers?hn(f.layers,d,f):f.layers);
   previous.forEach(releaseSet);
  }
  return release;
 });`;return{code:code.replace(original,replacement),map:null}}}}
