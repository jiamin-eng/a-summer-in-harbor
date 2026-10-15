// A failed RPGJS map can leave process-wide renderer state behind. Reconnect
// from a fresh document while retaining only the journey selection, never a
// client-side save or identity. The server rechecks the existing session.
const key='harbor-scene-reconnect-v1';
const lifetimeMs=60_000;
const journeyId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RetryStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

export function markSceneReconnect(storage:RetryStorage,id:string,now=Date.now()){
 if(!journeyId.test(id))return false;
 storage.setItem(key,JSON.stringify({id,at:now}));
 return true;
}

export function takeSceneReconnect(storage:RetryStorage,now=Date.now()):string|null{
 const value=storage.getItem(key);
 storage.removeItem(key); // One attempt only, including malformed and expired markers.
 if(!value)return null;
 try{
  const marker=JSON.parse(value);
  return typeof marker.id==='string'&&journeyId.test(marker.id)&&Number.isFinite(marker.at)&&marker.at<=now&&now-marker.at<=lifetimeMs?marker.id:null;
 }catch{return null}
}
