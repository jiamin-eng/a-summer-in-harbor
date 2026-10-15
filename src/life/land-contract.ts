/** Bounded slots shared by domain validation and actual renderer. Old slots
 * keep their IDs and coordinates; only an explicit schema-2 expansion adds 3/4. */
export const landRenderSlots=[1,2,3,4] as const;
export const landMaximum=(land?:{schema:number})=>land?.schema===2?4:2;
export const landBedIds=(land?:{schema:number})=>landRenderSlots.slice(0,landMaximum(land)).map(n=>'land-bed-'+n);
export const isLifeBed=(id:string,land?:{schema:number})=>/^life-bed-[1-4]$/.test(id)&&Number(id.slice(-1))<=landMaximum(land);
