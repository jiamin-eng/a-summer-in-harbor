/** Presentation budget in the actual app viewport, after the measured host/header. */
export function fishingDockBudget(appHeight:number,headerBottom:number){
 const available=Math.max(0,appHeight-headerBottom);
 const sceneMin=Math.min(240,Math.max(160,available*.45),Math.max(0,available-128));
 return {sceneMin,maxDock:Math.max(0,available-sceneMin)};
}
/** Captured touch pointers keep sending move events after leaving a control. */
export function reelPointerInside(rect:{left:number;right:number;top:number;bottom:number},x:number,y:number){
 return Number.isFinite(x)&&Number.isFinite(y)&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
}
