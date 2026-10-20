import type {Point} from '../engine/world';
/** Logical owner used by the existing shared-map paint masks. */
export const terrainZoneVisible=(zone:string,p:Point)=>zone==='coast'?!(p.x>=1235&&p.x<2035&&p.y>=260&&p.y<820)&&p.y<805:zone==='beach'?p.y>=805:zone==='path'?p.x>=1235:zone==='market'?p.y>=650:zone==='bazaar'?p.y<650:true;
