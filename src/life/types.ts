import type {Save} from '../story/state';
import type {Words} from '../world/data';

export type ContentRef={id:string;revision:number;hash:string;capability:'watered-crop-v1'};
export type CropDefinition={
 id:string;revision:number;capability:'watered-crop-v1';name:Words;
 condition:'cultivated-bed-v1';actions:readonly ['plant','water','harvest'];
 wetMinutes:number;growMinutes:number;seedCost:number;yield:number;salePrice:number;
 output:'produce';uses:readonly ['sell','save-seed','resident-order'];saleSink:'crop-counter';
 assets:readonly string[];
};
export type Lot={ref:ContentRef;kind:'seed'|'produce';quantity:number;firstSource:string;lastSource:string};
export type LifePlot={ref:ContentRef;grown:number;updatedAt:number;wetUntil:number};
/** Only new planting writes this policy. Absence preserves the old rule. */
export type SeedPlant={id:string;ref:ContentRef;plantedMinute:number};
export type SeedHarvest={id:string;plant:SeedPlant;harvestMinute:number;quantity:number;seedSpent:boolean};
export type SeedQuota={policy:'one-seed-per-plant-v1';plants:Record<string,SeedPlant>;harvests:SeedHarvest[]};
export type Discovery={id:string;sourceAction:string;minute:number;ref?:ContentRef;source?:{id:string;visualVersion:string;kind:'animal-schedule'}|{id:string;hash:string;kind:'frozen-news'}};
export type Order={id:string;definition:'theo-peas-v1';crop:ContentRef;quantity:2;reward:10;acceptedMinute:number;dueMinute:number};
export type LifeEvent={id:string;verb:string;minute:number;cash:number;energy:number;items:Record<string,number>;relations:Record<string,number>;facts:string[]};
export type LifeState={schema:1;lots:Lot[];legacyPlotRefs:Record<string,ContentRef>;plots:Record<string,LifePlot>;collections:Record<string,Discovery>;display:Record<string,string>;firstRewards:string[];order?:Order;cooldownUntil:number;events:LifeEvent[];seedQuotaV1?:SeedQuota};
export type LifeSave=Save&{lifeV1?:LifeState};
export type Command=
 |{verb:'permit-land';region:string}
 |{verb:'cultivate';region:string;at:{x:number;y:number}}
 |{verb:'buy-seed';ref:ContentRef}
 |{verb:'plant';ref:ContentRef;plot:string}
 |{verb:'water'|'harvest';plot:string}
 |{verb:'sell';ref:ContentRef}
 |{verb:'save-seed';ref:ContentRef;harvestBatch?:string}
 |{verb:'accept-order';ref:ContentRef}
 |{verb:'deliver-order'|'close-order'|'share-dani'}
 |{verb:'observe-animal';animal:string;behavior:'sun-rest'|'sleep'}
 |{verb:'display-gift';slot:string;gift?:string}
 |{verb:'news-memento';edition:string};
/** Only constructed inside the trusted server after spatial/source admission.
 * No field in this structure may be copied unchecked from a client payload. */
export type Admission={
 land?:{region:string;geometryRevision:1;position:{x:number;y:number}};
 scene:string;target:string;plot?:string;cultivated?:boolean;
 resident?:'theo'|'dani';premiseRead?:boolean;displaySlot?:string;
 animal?:{id:string;behavior:'sun-rest'|'sleep';visualVersion:string};
 news?:{id:string;hash:string;read:boolean;fictionComplete:boolean};
};
export type Intent={actionId:string;expectedVersion:number;command:Command};
export type LifeResult={head:LifeSave;text:Words;event:LifeEvent};
