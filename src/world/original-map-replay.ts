import originalGround from './original-map-native/harbor-base-7586.png';
import {Assets,type Texture} from 'pixi.js';
export const originalMapReplay=typeof location!=='undefined'&&new URLSearchParams(location.search).get('map-origin')==='7586e46';
let texture:Texture|undefined;
export async function prepareOriginalMap(scene:string){if(!originalMapReplay||scene!=='harbor'||texture)return;texture=await Assets.load<Texture>(originalGround);texture.source.scaleMode='nearest';}
export const originalMapLayers=(scene:string)=>originalMapReplay&&scene==='harbor'&&texture?[{texture,at:{x:0,y:0},clip:{x:0,y:0,w:1440,h:1088}}]:[];
