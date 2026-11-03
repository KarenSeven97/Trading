import type { BarSet, Execution, PriceBar } from '../domain/model';
import { dayKey } from '../domain/time';
export function executionAxisTime(data:BarSet,e:Execution):number {
 return data.interval==='1day' ? Date.parse(dayKey(e.time)+'T00:00:00Z')/1000 : Date.parse(e.time)/1000;
}
/** Add time-only whitespace, never manufactured OHLC prices, at actual execution times. */
export function executionTimeline(data:BarSet,executions:Execution[]):(PriceBar|{time:number})[] {
 const points=new Map<number,PriceBar|{time:number}>(data.bars.map(b=>[b.time,b]));
 for(const e of executions){if(e.symbol!==data.symbol)continue;const time=executionAxisTime(data,e);if(Number.isFinite(time)&&!points.has(time))points.set(time,{time});}
 return [...points.values()].sort((a,b)=>a.time-b.time);
}
