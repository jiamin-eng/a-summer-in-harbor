import type {IncomingMessage,ServerResponse} from 'node:http';
import {FISHING_PROTOCOL,fishingContract} from '../src/fishing-release';
/** Fail before authority access; refresh does not retire an uncertain action. */
export function fishingClientContract(req:IncomingMessage,res:ServerResponse){
 const path=new URL(req.url!,'http://localhost').pathname;
 if(path==='/api/client-contract'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(fishingContract()));return true}
 if(req.headers['x-harbor-fishing']===FISHING_PROTOCOL)return false;
 res.writeHead(409,{'Content-Type':'application/json','Cache-Control':'no-store','X-Harbor-Client-Refresh':'required'});res.end(JSON.stringify({error:'CLIENT_REFRESH_REQUIRED',terminal:false,requiredFishingProtocol:FISHING_PROTOCOL,message:{en:'Reload the game to continue safely. Any saved catch is kept.',zh:'请重新载入游戏再继续；已经保存的钓获会保留。'}}));return true;
}
