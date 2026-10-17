// Temporary loopback-only OAuth transport for the trophy probe.
// No credentials are logged, written to disk, or retained between requests.
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const AUTH='https://ca.account.sony.com/api/authz/v3/oauth';
const REDIRECT='com.scee.psxandroid.scecompcall://redirect';
const CLIENT='09515159-7237-4370-9b40-3806e67c0891';
const BASIC='Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const SAFE_ERROR=Symbol('public-error');
const publicError=(code,message,status=502)=>Object.assign(Error(message),{code,status,[SAFE_ERROR]:true});

export async function exchangeSession(npsso,fetchImpl=fetch,signal){
 const timeout=()=>signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
 const params=new URLSearchParams({access_type:'offline',client_id:CLIENT,redirect_uri:REDIRECT,response_type:'code',scope:'psn:mobile.v2.core psn:clientapp'});
 const redirect=await fetchImpl(AUTH+'/authorize?'+params,{redirect:'manual',headers:{Cookie:'npsso='+npsso},signal:timeout()});
 let target;try{target=new URL(redirect.headers.get('location'));}catch{}
 const expected=new URL(REDIRECT);
 if(![302,303,307,308].includes(redirect.status)||!target||target.protocol!==expected.protocol||target.host!==expected.host||!['','/'].includes(target.pathname)||target.username||target.password||target.hash||target.searchParams.has('error'))throw publicError('access_code','Sony 未提供預期的授權碼重新導向，請重新登入後再試。');
 const codes=target.searchParams.getAll('code');
 if(codes.length!==1||!/^[A-Za-z0-9._~-]{1,4096}$/.test(codes[0]))throw publicError('access_code','Sony 授權碼格式不正確。');
 const token=await fetchImpl(AUTH+'/token',{method:'POST',redirect:'manual',headers:{Authorization:BASIC,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:codes[0],redirect_uri:REDIRECT,grant_type:'authorization_code',token_format:'jwt'}),signal:timeout()});
 if(token.status!==200)throw publicError('token','Sony 權杖交換失敗。');
 let value;try{value=await token.json();}catch{throw publicError('token','Sony 權杖格式不正確。');}
 if(typeof value.access_token!=='string'||!value.access_token||value.access_token.length>16000||!Number.isFinite(Number(value.expires_in))||Number(value.expires_in)<=0)throw publicError('token','Sony 權杖格式不正確。');
 return {accessToken:value.access_token,expiresIn:Number(value.expires_in)};
}

export function createHelper({fetchImpl=fetch}={}){
 const nonce=randomBytes(24).toString('hex');let busy=false,windowStart=Date.now(),attempts=0;
 const server=http.createServer(async(req,res)=>{
  const send=(status,value)=>{if(!res.writableEnded){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const port=server.address()?.port;
  if(req.headers.host!=='127.0.0.1:'+port)return send(403,{error:'host',message:'僅接受本機位址。'});
  const origin=req.headers.origin;
  if(origin&&origin!=='https://library.playstation.com'&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin))return send(403,{error:'origin',message:'拒絕非預期的來源。'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, X-PSGB-Client');res.writeHead(204);res.end();return;}
  if(req.headers['x-psgb-client']!=='trophy-probe')return send(403,{error:'client',message:'僅供本機獎盃測試腳本使用。'});
  if(req.method==='GET'&&req.url==='/session')return send(200,{nonce,kind:'ps-game-base-local-trophy-auth'});
  if(req.method!=='POST'||req.url!=='/authorize')return send(404,{error:'route',message:'沒有此操作。'});
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return send(415,{error:'content_type',message:'只接受 JSON。'});
  if(Number(req.headers['content-length'])>4096)return send(413,{error:'size',message:'請求過大。'});
  try{
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>4096)throw publicError('size','請求過大。',413);chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw publicError('json','JSON 格式錯誤。',400);}
   if(typeof data?.nonce!=='string'||!/^[a-f0-9]{48}$/.test(data.nonce)||!timingSafeEqual(Buffer.from(data.nonce),Buffer.from(nonce)))throw publicError('nonce','本機助手工作階段不符。',403);
   if(typeof data.npsso!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(data.npsso))throw publicError('session','Sony 登入資料格式不正確。',400);
   if(busy)throw publicError('busy','本機授權正在進行。',429);
   if(Date.now()-windowStart>60000){windowStart=Date.now();attempts=0;}
   if(attempts>=10)throw publicError('rate','授權過於頻繁，請一分鐘後再試。',429);
   attempts++;busy=true;const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
   try{send(200,await exchangeSession(data.npsso,fetchImpl,controller.signal));}finally{busy=false;res.removeListener('close',closed);}
  }catch(e){const safe=e?.[SAFE_ERROR]===true;send(safe?e.status:502,{error:safe?e.code:'network',message:safe?e.message:'Sony 授權連線失敗；未保存憑證，請稍後再試。'});}
 });
 server.requestTimeout=35000;server.headersTimeout=10000;
 return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const server=createHelper();
 server.on('error',()=>{console.error('本機獎盃助手無法啟動，請檢查 4176 連接埠。');process.exitCode=1;});
 server.listen(4176,'127.0.0.1',()=>console.log('本機獎盃授權助手已就緒：127.0.0.1:4176（僅供測試，15 分鐘後停止接收連線）'));
 setTimeout(()=>server.close(),15*60*1000).unref();
}
