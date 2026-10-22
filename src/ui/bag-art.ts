import {fishingItemImages} from './fishing-art';
import manifest from './bag-art.json';
import snapPea from '../world/snap-pea-art.json';
import {mintArtAccepted,wildMintAssets} from '../world/wild-mint-art';
import type {ContentRef} from '../life/types';

export function itemArt(item:string):string|undefined{
 if(Object.hasOwn(fishingItemImages,item))return fishingItemImages[item];
 const key=item==='wild:harbor-mint-leaf'?'wild-mint-leaf':item;
 if(key==='wild-mint-leaf'&&!mintArtAccepted(wildMintAssets))return;
 return manifest.assets[key as keyof typeof manifest.assets]?.image;
}
/** Exact immutable batch identity; never borrow the current species image for an unknown old revision. */
export function batchArt(ref:ContentRef,kind:'seed'|'produce'):string|undefined{
 const same=(pin:{id:string;revision:number;hash:string;capability:string})=>['id','revision','hash','capability'].every(k=>ref[k as keyof ContentRef]===pin[k as keyof ContentRef]);
 if(same(snapPea.ref))return manifest.assets[kind==='seed'?'snap-pea-seed':'snap-pea-produce'].image;
 const pin=manifest.legacyRefs.find(p=>same(p as ContentRef));
 return pin&&kind==='produce'?itemArt('crop-'+ref.id.slice(5)):undefined;
}
