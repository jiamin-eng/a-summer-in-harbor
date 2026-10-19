import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';

/** Explicit socket-free QA transport. Runs the unchanged Node HTTP handler;
 * no listener or external fetch is permitted in this mode. */
export function inProcessHttp(handler:any,close:()=>Promise<void>){
 const previous=globalThis.fetch,url='http://127.0.0.1:49161';
 const fetchImpl=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const request=new Request(input,init),at=new URL(request.url);
  if(at.origin!==url)throw Error('QA_EXTERNAL_NETWORK_DISABLED');
  const bytes=Buffer.from(await request.arrayBuffer()),req=Readable.from(bytes.length?[bytes]:[]) as any;
  req.url=at.pathname+at.search;req.method=request.method;req.headers=Object.fromEntries(request.headers);
  const res:any=new EventEmitter();let status=200,body=Buffer.alloc(0);const headers=new Headers();
  res.writableEnded=false;res.headersSent=false;res.destroyed=false;
  res.setHeader=(k:string,v:string)=>headers.set(k,v);res.getHeader=(k:string)=>headers.get(k);
  res.writeHead=(code:number,h:Record<string,string>={})=>{status=code;for(const [k,v]of Object.entries(h))headers.set(k,v);res.headersSent=true};
  res.end=(chunk:any)=>{body=Buffer.from(chunk??'');res.writableEnded=true};
  await handler(req,res);if(!res.writableEnded)throw Error('QA_HTTP_RESPONSE_NOT_ENDED');
  return new Response(body,{status,headers});
 }) as typeof fetch;
 globalThis.fetch=fetchImpl;
 return {url,async close(){globalThis.fetch=previous;await close()}};
}
