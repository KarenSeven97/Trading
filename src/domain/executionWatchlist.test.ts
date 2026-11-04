import {beforeEach, expect, it, vi} from 'vitest';
import 'fake-indexeddb/auto';
import {IDBFactory} from 'fake-indexeddb';
import {emptyJournal, type Execution} from './model';
import {calculate} from './ledger';
import {watchExecutionSymbols} from './executionWatchlist';
import {persistLocal, loadLocal} from '../data/storage';
import {backup, parseBackup} from '../data/transfer';
const buy:Execution={id:'watch-buy',symbol:'GOOG',side:'buy',price:'100',quantity:'10',fee:'1',time:'2026-11-03T15:00:00Z',note:'买入判断',tags:['反弹'],source:'manual',createdAt:'2026-11-03T15:00:00Z',updatedAt:'2026-11-03T15:00:00Z',seq:0};
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()));
it('a new execution appends its symbol without changing existing manual order',()=>{
 const j={...emptyJournal(),watchlist:['QQQM','AMD'],executions:[buy]};
 const next=watchExecutionSymbols(j,[buy]);
 expect(next.watchlist).toEqual(['QQQM','AMD','GOOG']);
 expect(next.instruments.find(i=>i.symbol==='GOOG')?.name).toBe('谷歌母公司 Alphabet');
 expect(j.watchlist).toEqual(['QQQM','AMD']);
});
it('full and batched fills add each stock once and retain exact execution facts and PNL',()=>{
 const sell:Execution={...buy,id:'watch-sell',side:'sell',price:'110',seq:1,time:'2026-11-03T16:00:00Z',note:'卖出判断'};
 const j={...emptyJournal(),watchlist:[],executions:[buy,sell]};
 const next=watchExecutionSymbols(j,j.executions);
 expect(next.watchlist).toEqual(['GOOG']);expect(next.executions).toBe(j.executions);
 expect(calculate(next.executions).trades[0].pnl).toBe('98');
});
it('repeat records never duplicate watched symbols or replace user instrument metadata',()=>{
 const custom={symbol:'GOOG',name:'自定义名称',exchange:'NASDAQ',type:'股票' as const};
 const j={...emptyJournal(),watchlist:['GOOG','AMD'],instruments:[custom]};
 const next=watchExecutionSymbols(j,[buy,buy]);
 expect(next.watchlist).toEqual(['GOOG','AMD']);expect(next.instruments).toEqual([custom]);
});
it('the execution and its new watch entry survive one local save and full backup restoration',async()=>{
 const j=watchExecutionSymbols({...emptyJournal(),watchlist:[],executions:[buy]},[buy]);
 await persistLocal(j);
 const restored=await loadLocal('live');
 expect(restored.watchlist).toEqual(['GOOG']);expect(restored.executions).toEqual([buy]);
 const roundtrip=parseBackup(backup(restored));
 expect(roundtrip.watchlist).toEqual(restored.watchlist);expect(roundtrip.executions).toEqual(restored.executions);
});
