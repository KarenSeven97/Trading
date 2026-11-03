import { useEffect, useRef, useState } from 'react';
import { fetchFx, parseFx, type FxRate, type Currency } from './fx';
function cachedRate():FxRate|null { try { const d=JSON.parse(localStorage.getItem('tj-fx-rate')||'null'); return d ? {...parseFx({...d,base:'USD',quote:'CNY'}),fetchedAt:typeof d.fetchedAt==='string'?d.fetchedAt:''} : null; } catch{return null;} }
export function useCurrency(notify:(text:string)=>void) {
 const [currency,setCurrency]=useState<Currency>(()=>{try{return localStorage.getItem('tj-display-currency')==='CNY' && cachedRate() ? 'CNY' : 'USD';}catch{return 'USD';}}),[rate,setRate]=useState<FxRate|null>(cachedRate),[busy,setBusy]=useState(false);
 const pending=useRef(false),mounted=useRef(true);
 async function update(activate=false) {
  if(pending.current)return; pending.current=true;setBusy(true);
  try {
   const next=await fetchFx();if(!mounted.current)return;setRate(next);
   if(activate)setCurrency('CNY');
   try{localStorage.setItem('tj-fx-rate',JSON.stringify(next));}catch{}
  }catch {
   if(!mounted.current)return;
   const saved=cachedRate();
   if(saved){setRate(saved);if(activate)setCurrency('CNY');notify(`汇率更新失败，使用 ${saved.date} 缓存参考汇率`);}
   else notify('无法获取汇率，继续显示美元；请联网后重试');
  }finally {pending.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  try{localStorage.setItem('tj-display-currency',currency);}catch{}
 },[currency]);
 useEffect(()=>{
  if(currency!=='CNY')return;
  if(!rate || !Number.isFinite(Date.parse(rate.fetchedAt)) || Date.now()-Date.parse(rate.fetchedAt)>300000)void update();
  const refresh=()=>void update();const timer=window.setInterval(refresh,3600000);
  addEventListener('focus',refresh);addEventListener('online',refresh);
  return ()=>{clearInterval(timer);removeEventListener('focus',refresh);removeEventListener('online',refresh);};
 },[currency]);
 return {currency,rate,busy,toggle:()=>currency==='CNY'?setCurrency('USD'):void update(true)};
}
