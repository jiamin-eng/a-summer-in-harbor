/** Pure CPU coastal composition. No DOM, engine, save or network dependencies. */
export type Material='water'|'sand'|'grass'|'stone'|'wood';
export type PixelTile={width:number;height:number;data:Uint8Array|Uint8ClampedArray};
export type Rule={id:number;corners:number[];probability?:number};
type Rect={x:number;y:number;w:number;h:number};
type Options={atlas:PixelTile;rules:Rule[];materials:Record<'grass'|'sand'|'water',PixelTile>;materialAt:(x:number,y:number)=>Material;wetSand?:PixelTile;foam?:PixelTile};
const mod=(x:number,n:number)=>((x%n)+n)%n;
export function createCoastalComposer(o:Options){
 const signatures=new Map<string,number>();
 for(const r of [...o.rules].sort((a,b)=>(b.probability??1)-(a.probability??1)||a.id-b.id))if(!signatures.has(r.corners.join(',')))signatures.set(r.corners.join(','),r.id);
 const masks=new Map<number,Uint8Array>(),tiles=new Map<string,Uint8Array>();
 const palette=(id:number)=>{const out:number[][]=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=((Math.floor(id/(o.atlas.width/16))*16+y)*o.atlas.width+(id%(o.atlas.width/16))*16+x)*4;out.push(Array.from(o.atlas.data.slice(i,i+3)))}return out};
 const land=palette(100),water=palette(171),grass=palette(150);
 const distance=(r:number,g:number,b:number,colors:number[][])=>{let d=Infinity;for(const q of colors){const n=(r-q[0])**2+(g-q[1])**2+(b-q[2])**2;if(n<d)d=n;if(!d)break}return d};
 function mask(bits:number,pair:'shore'|'sandGrass'){
  const cacheKey=bits+(pair==='shore'?0:16);let value=masks.get(cacheKey);if(value)return value;
  const a=pair==='shore'?2:1,b=pair==='shore'?4:2,corners=[0,1,2,3].map(i=>bits&(1<<i)?b:a),id=signatures.get(corners.join(','));
  if(id===undefined)throw Error('COAST_MASK_MISSING:'+pair+':'+bits);
  value=new Uint8Array(256);for(let y=0;y<16;y++)for(let x=0;x<16;x++){
   const i=((Math.floor(id/(o.atlas.width/16))*16+y)*o.atlas.width+(id%(o.atlas.width/16))*16+x)*4,r=o.atlas.data[i],g=o.atlas.data[i+1],b=o.atlas.data[i+2];
   value[y*16+x]=distance(r,g,b,pair==='shore'?water:land)<distance(r,g,b,pair==='shore'?land:grass)?1:0;
  }masks.set(cacheKey,value);return value;
 }
 function tile(tx:number,ty:number){
  const key=tx+':'+ty;let result=tiles.get(key);if(result)return result;
  const x=tx*16,y=ty*16,corner=[[x+16,y],[x+16,y+16],[x,y+16],[x,y]].map(([a,b])=>o.materialAt(a-.01,b-.01));
  const bits=(material:Material)=>corner.reduce((n,m,i)=>n|(m===material?1<<i:0),0);
  const shore=mask(bits('water'),'shore'),sand=mask(bits('sand'),'sandGrass');
  const hard=corner.some(m=>m==='stone'||m==='wood');
  // Preserve sub-cell channels/islands that four vertex samples cannot express.
  const authored=Array.from({length:256},(_,i)=>o.materialAt(x+i%16+.5,y+Math.floor(i/16)+.5));
  const aliased=new Set(corner).size===1&&authored.some(m=>m!==corner[0]);
  result=new Uint8Array(256);for(let py=0;py<16;py++)for(let px=0;px<16;px++){
   const i=py*16+px,raw=authored[i];
   const mat=hard||aliased||raw==='stone'||raw==='wood'?raw:shore[i]?'water':!corner.includes('grass')?'sand':!corner.includes('sand')?'grass':sand[i]?'sand':'grass';
   result[i]=mat==='water'?0:mat==='sand'?1:mat==='grass'?2:3;
  }tiles.set(key,result);return result;
 }
 const kind=(x:number,y:number)=>tile(Math.floor(x/16),Math.floor(y/16))[mod(Math.floor(y),16)*16+mod(Math.floor(x),16)];
 const pixel=(image:PixelTile,x:number,y:number)=>{const i=(mod(Math.floor(y),image.height)*image.width+mod(Math.floor(x),image.width))*4;return Array.from(image.data.slice(i,i+4))};
 const offsets=Array.from({length:17*17},(_,i)=>({x:i%17-8,y:Math.floor(i/17)-8})).map(p=>({...p,d:Math.hypot(p.x,p.y)})).filter(p=>p.d>0&&p.d<=8).sort((a,b)=>a.d-b.d);
 function render(r:Rect){
  const out=new Uint8ClampedArray(r.w*r.h*4),stride=r.w+16,field=new Uint8Array(stride*(r.h+16));
  for(let y=-8;y<r.h+8;y++)for(let x=-8;x<r.w+8;x++)field[(y+8)*stride+x+8]=kind(r.x+x,r.y+y);
  const nearby=(x:number,y:number,target:number,max:number)=>{const i=(y+8)*stride+x+8;for(const p of offsets){if(p.d>max)break;if(field[i+p.y*stride+p.x]===target)return p.d}return max+1};
  for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++){
   const gx=r.x+x,gy=r.y+y,k=field[(y+8)*stride+x+8],i=(y*r.w+x)*4;
   if(k===3)continue; // Original hard quay/bridge pixels remain underneath.
   const raw=o.materialAt(gx+.5,gy+.5),rawKind=raw==='water'?0:raw==='sand'?1:raw==='grass'?2:3;let changed=k!==rawKind;
   let c=pixel(o.materials[k===0?'water':k===1?'sand':'grass'],gx,gy);
   if(k===1){const d=nearby(x,y,0,8);if(d<8){changed=true;const wet=o.wetSand?pixel(o.wetSand,gx,gy):c.map((v,j)=>j===3?255:Math.round(v*.79));const weight=d<=5?1:(8-d)/3;c=c.map((v,j)=>j===3?255:Math.round(v*(1-weight)+wet[j]*weight))}}
   if(k===0){const d=nearby(x,y,1,3);if(d<=3){changed=true;
    let support=0;for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++)if(field[(y+8+b)*stride+x+8+a]===0)support++;
    const crest=mod(gx+gy*3,11)<8&&support>=15;
    if(d<=1.5&&crest){const foam=o.foam?pixel(o.foam,gx,gy):[202,225,207,255],alpha=.78*foam[3]/255;c=c.map((v,j)=>j===3?255:Math.round(v*(1-alpha)+foam[j]*alpha))}
    else c=[...c.slice(0,3).map((v,j)=>Math.round(v*.8+[103,160,157][j]*.2)),255];
   }}if(changed)out.set(c,i);
  }return out;
 }
 return {render,kind,mask,diagnostics:()=>({tilePixels:16,masks:masks.size,cachedCells:tiles.size,worldPhase:true,collisionChanged:false,wetSandFallback:!o.wetSand,foamFallback:!o.foam})};
}
