import { it, expect } from 'vitest';
import { executionAxisTime, executionTimeline } from './executionTimeline';
import { emptyJournal, type Execution, type BarSet } from '../domain/model';
import { calculate } from '../domain/ledger';
const e=(id:string,time='2026-11-02T14:08:15Z',price='103.25'):Execution=>({id,time,price,symbol:'AMD',quantity:'2',fee:'0',side:'buy',note:'买入笔记',tags:[],source:'manual',seq:0,createdAt:time,updatedAt:time});
const data:BarSet={symbol:'AMD',interval:'15min',source:'test',demo:false,importedAt:'',bars:[{time:Date.parse('2026-11-02T14:30:00Z')/1000,open:100,high:110,low:90,close:105,volume:10}]};
it('unclosed buy before first available candle gets an exact time-only anchor and no closed match',()=>{
 const buy=e('buy'),snapshot=JSON.stringify(data);const points=executionTimeline(data,[buy]);
 expect(points[0]).toEqual({time:Date.parse(buy.time)/1000});expect(points[1]).toEqual(data.bars[0]);expect(calculate([buy]).matches).toEqual([]);expect(JSON.stringify(data)).toBe(snapshot);
});
it('gaps and multiple intrabar executions retain independent actual times without fabricating OHLC',()=>{
 const fills=[e('1','2026-11-02T14:35:11Z'),e('2','2026-11-02T14:35:59Z'),e('3','2026-11-02T15:08:01Z')];
 const points=executionTimeline(data,fills);expect(points).toHaveLength(4);expect(points.filter(p=>'open' in p)).toHaveLength(1);for(const fill of fills)expect(points.some(p=>p.time===Date.parse(fill.time)/1000)).toBe(true);
});
it('empty market history still has actual execution anchors, duplicates group without deleting fills',()=>{
 const fills=[e('1'),e('2')];expect(executionTimeline({...data,bars:[]},fills)).toEqual([{time:Date.parse(fills[0].time)/1000}]);expect(fills).toHaveLength(2);
});
it('daily anchors use the New York trade date, and unrelated symbols are excluded',()=>{
 const daily={...data,interval:'1day'},fill=e('b','2026-11-03T00:05:00Z');expect(executionAxisTime(daily,fill)).toBe(Date.parse('2026-11-02T00:00:00Z')/1000);expect(executionTimeline({...daily,bars:[]},[{...fill,symbol:'QQQM'}])).toEqual([]);
});
