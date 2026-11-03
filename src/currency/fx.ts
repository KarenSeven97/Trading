import { D, money } from '../domain/ledger';
export type Currency = 'USD' | 'CNY';
export interface FxRate { date:string; rate:string; fetchedAt:string; }
export function parseFx(data:unknown):FxRate {
 const d=data as any;
 if(!d || d.base!=='USD'||d.quote!=='CNY'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)||!Number.isFinite(Date.parse(d.date+'T00:00:00Z'))||!D(d.rate ?? 'NaN').isFinite()||D(d.rate).lte(0)) throw new Error('汇率数据无效');
 return {date:d.date,rate:D(d.rate).toString(),fetchedAt:new Date().toISOString()};
}
export function displayMoney(value:Parameters<typeof money>[0], sign=true, currency:Currency='USD', rate?:FxRate|null) {
 if(currency==='USD')return money(value,sign);
 if(!rate)throw new Error('尚未获取人民币汇率');
 return money(D(value).mul(rate.rate),sign).replace('$','¥');
}
export async function fetchFx():Promise<FxRate> {
 const r=await fetch('https://api.frankfurter.dev/v2/rate/USD/CNY',{signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!r.ok)throw new Error('汇率服务暂不可用');
 return parseFx(await r.json());
}
