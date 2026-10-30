/** Isolated contract probe. Importing this module does not enable account binding.
 * The fixed no-parameter endpoint is documented by the platform as returning
 * the current token subject; this module alone does not enable account binding. */
export type NoParamTokenCandidate = Readonly<{telegramId:string;candidateMatch:true}>;
type ProbeOptions={endpoint:string;fetchImpl:typeof fetch;timeoutMs?:number};

const idPattern=/^[1-9][0-9]{0,29}$/;
const tokenPattern=/^[\x21-\x7e]{1,4096}$/;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

async function boundedJson(response:Response):Promise<unknown>{
 if(!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Error('PLATFORM_CONTENT_TYPE_INVALID');
 const reader=response.body?.getReader();if(!reader)throw Error('PLATFORM_BODY_MISSING');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   size+=part.value.byteLength;if(size>16384)throw Error('PLATFORM_BODY_TOO_LARGE');
   chunks.push(part.value);
  }
 }finally{await reader.cancel().catch(()=>{})}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}
 catch{throw Error('PLATFORM_JSON_INVALID')}
}

/** The verifier supplies the fixed endpoint. The platform's LoginFilter uses
 * one Authorization Bearer header; no Telegram ID is sent as a parameter. */
export function createNoParamTokenCandidateProbe({endpoint,fetchImpl,timeoutMs=3000}:ProbeOptions){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('PLATFORM_ENDPOINT_INVALID');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('PLATFORM_TIMEOUT_INVALID');
 return async (expectedTelegramId:unknown,bearerHeader:unknown):Promise<NoParamTokenCandidate>=>{
  if(typeof expectedTelegramId!=='string'||!idPattern.test(expectedTelegramId))throw Error('PLATFORM_ID_INVALID');
  if(typeof bearerHeader!=='string'||!bearerHeader.startsWith('Bearer ')||!tokenPattern.test(bearerHeader.slice(7)))throw Error('PLATFORM_TOKEN_REQUIRED');
  let response:Response;
  try{response=await fetchImpl(url,{method:'GET',headers:{Authorization:bearerHeader,Accept:'application/json'},redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(timeoutMs)})}
  catch{throw Error('PLATFORM_HTTP_UNAVAILABLE')}
  if(response.status===401||response.status===403)throw Error('PLATFORM_HTTP_REJECTED');
  if(response.status!==200)throw Error('PLATFORM_HTTP_UNAVAILABLE');
  const payload=await boundedJson(response);
  if(!object(payload)||payload.retcode!==0)throw Error('PLATFORM_RETCODE_INVALID');
  if(payload.errcode!==0)throw Error('PLATFORM_ERRCODE_INVALID');
  if(payload.msg!=='success')throw Error('PLATFORM_MSG_INVALID');
  if(!object(payload.data)||typeof payload.data.telegram_id!=='string'||!idPattern.test(payload.data.telegram_id))throw Error('PLATFORM_TELEGRAM_ID_INVALID');
  if(payload.data.telegram_id!==expectedTelegramId)throw Error('PLATFORM_TELEGRAM_ID_MISMATCH');
  return Object.freeze({telegramId:payload.data.telegram_id,candidateMatch:true});
 };
}

/** Same platform response as the probe. The Bearer token alone selects the subject. */
export function createPlatformBearerIdentity({endpoint,fetchImpl,timeoutMs=3000}:ProbeOptions){
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('PLATFORM_ENDPOINT_INVALID');
 if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw Error('PLATFORM_TIMEOUT_INVALID');
 return async (bearerHeader:unknown):Promise<string>=>{
  if(typeof bearerHeader!=='string'||!bearerHeader.startsWith('Bearer ')||!tokenPattern.test(bearerHeader.slice(7)))throw Error('PLATFORM_TOKEN_REQUIRED');
  let response:Response;
  try{response=await fetchImpl(url,{method:'GET',headers:{Authorization:bearerHeader,Accept:'application/json'},redirect:'error',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(timeoutMs)})}
  catch{throw Error('PLATFORM_HTTP_UNAVAILABLE')}
  if(response.status===401||response.status===403)throw Error('PLATFORM_HTTP_REJECTED');
  if(response.status!==200)throw Error('PLATFORM_HTTP_UNAVAILABLE');
  const payload=await boundedJson(response);
  if(!object(payload)||payload.retcode!==0)throw Error('PLATFORM_RETCODE_INVALID');
  if(payload.errcode!==0)throw Error('PLATFORM_ERRCODE_INVALID');
  if(payload.msg!=='success')throw Error('PLATFORM_MSG_INVALID');
  if(!object(payload.data)||typeof payload.data.telegram_id!=='string'||!idPattern.test(payload.data.telegram_id))throw Error('PLATFORM_TELEGRAM_ID_INVALID');
  return payload.data.telegram_id;
 };
}
