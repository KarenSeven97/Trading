import Decimal from 'npm:decimal.js@10.6.0';
import { DateTime } from 'npm:luxon@3.7.0';
const publicKey='sb_publishable_ER_v4t7E4cUKWU9F9KFaDA_xUSs9735';
const origins=['https://trade-journal-ledger.sappy-bat-8700.chatgpt.site','https://karenseven97.github.io','http://terminal.local:4173','http://localhost:5173'];
const cache=new Map();
async function upstream(path:string,params:Record<string,string>={},trading=false){
 const key=Deno.env.get('ALPACA_API_KEY'),secret=Deno.env.get('ALPACA_SECRET_KEY');
 if(!key||!secret)throw new Error('请在 Edge Functions Secrets 保存 ALPACA_API_KEY 与 ALPACA_SECRET_KEY');
 const u=new URL((trading?'https://paper-api.alpaca.markets':'https://data.alpaca.markets')+path);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
 const r=await fetch(u,{headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`Alpaca ${r.status}：${r.status===401?'密钥验证失败':r.status===403?'当前账户无此行情权限':r.status===429?'免费请求额度暂时用尽，请稍后重试':'行情请求失败，请检查日期和代码'}`);
 return r.json();
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Origin':origins.includes(origin)?origin:origins[0],'Access-Control-Allow-Headers':'apikey,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.includes(origin))return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return reply({error:'Only GET allowed'},405);
 if(req.headers.get('apikey')!==publicKey)return reply({error:'Invalid application key'},401);
 try{
 const u=new URL(req.url),path=u.pathname.split('/').pop(),a=u.searchParams,symbol=(a.get('symbol')||'').toUpperCase();
 if(path!=='search'&&!/^[A-Z0-9.-]{1,16}$/.test(symbol))return reply({error:'无效股票代码'},400);
 const hit=cache.get(u.pathname+u.search);if(hit&&hit.until>Date.now())return reply(hit.data);
 let data:any;
 if(path==='history'){
 const interval=a.get('interval')||'',tf:Record<string,string>={'1min':'1Min','5min':'5Min','15min':'15Min','1day':'1Day'};
 const start=DateTime.fromISO(a.get('start')||'',{zone:'America/New_York'}).startOf('day'),end=DateTime.fromISO(a.get('end')||'',{zone:'America/New_York'}).endOf('day');
 if(!tf[interval]||!start.isValid||!end.isValid||start>end)return reply({error:'周期或日期无效'},400);
 const bars:any[]=[];let token='';
 do{
 const d=await upstream(`/v2/stocks/${encodeURIComponent(symbol)}/bars`,{timeframe:tf[interval],start:start.toUTC().toISO()!,end:end.toUTC().toISO()!,feed:'iex',adjustment:'raw',sort:'asc',limit:'10000',...(token?{page_token:token}:{})});
 bars.push(...(d.bars||[]));token=d.next_page_token||'';
 if(token&&bars.length>=20000)return reply({error:'范围超过 20000 根 K 线，请缩小日期范围'},400);
 }while(token);
 data={source:'Alpaca IEX · 单一交易所 · 未复权 · 非全市场行情',bars:bars.map(b=>({time:interval==='1day'?Date.parse(DateTime.fromISO(b.t,{zone:'America/New_York'}).toISODate()+'T00:00:00Z')/1000:Date.parse(b.t)/1000,open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v}))};
 }else if(path==='quote'){
 const d=await upstream(`/v2/stocks/${encodeURIComponent(symbol)}/snapshot`,{feed:'iex'}),price=d.latestTrade?.p,previous=d.prevDailyBar?.c;
 if(!(price>0)||!(previous>0)||!d.latestTrade?.t)throw new Error('IEX 报价或前收盘缺失，无法计算涨跌；请查看历史 K 线');
 data={symbol,name:symbol,price:String(price),change:new Decimal(price).minus(previous).toString(),percent:new Decimal(price).div(previous).minus(1).mul(100).toString(),time:d.latestTrade.t,source:'Alpaca IEX · 单一交易所 · 相对前交易日 IEX 收盘'};
 }else if(path==='search'){
 const query=(a.get('query')||'').trim().toUpperCase();if(!query||query.length>40)return reply({error:'无效搜索条件'},400);
 let assets=cache.get('assets');if(!assets||assets.until<Date.now()){assets={until:Date.now()+3600000,data:await upstream('/v2/assets',{status:'active',asset_class:'us_equity'},true)};cache.set('assets',assets);}
 data=assets.data.filter((x:any)=>x.symbol.includes(query)||x.name.toUpperCase().includes(query)).sort((x:any,y:any)=>(x.symbol===query?-1:y.symbol===query?1:x.symbol.localeCompare(y.symbol))).slice(0,15).map((x:any)=>({symbol:x.symbol,name:x.name}));
 }else return reply({error:'Unknown route'},404);
 if(cache.size>200)cache.clear();cache.set(u.pathname+u.search,{data,until:Date.now()+60000});return reply(data);
 }catch(e){return reply({error:(e as Error).message},502);}
});
