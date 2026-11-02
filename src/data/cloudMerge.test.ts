import { describe, expect, it } from 'vitest';
import { emptyJournal, type Execution } from '../domain/model';
import { calculate } from '../domain/ledger';
import { mergeInitial, mergeShared, sharedDocument, withDeviceSettings, canonical } from './cloudMerge';
const fill = (id:string, side:'buy'|'sell'='buy', quantity='10'):Execution => ({id,symbol:'AMD',side,quantity,price:side==='buy'?'100':'120',fee:'1',time:side==='buy'?'2026-10-26T14:00:00Z':'2026-10-26T15:00:00Z',note:'',tags:[],source:'manual',seq:side==='buy'?0:1,createdAt:'2026-10-26T14:00:00Z',updatedAt:'2026-10-26T14:00:00Z'});
describe('Shared ledger merge',()=>{
 it('independent additions retain all fills and realized FIFO results',()=>{
  const b=emptyJournal(),l=structuredClone(b),r=structuredClone(b);
  l.executions=[fill('b1')];r.executions=[{...fill('b2'),price:'110'}];
  const merged=mergeShared(b,l,r);expect(merged.executions).toHaveLength(2);
  merged.executions.push({...fill('s','sell','15'),seq:3});
  expect(calculate(merged.executions).trades[0].pnl).toBe('197.5');
 });
 it('simultaneous changes of same execution conflict without mutating inputs',()=>{
  const b=emptyJournal();b.executions=[fill('b')];const l=structuredClone(b),r=structuredClone(b);
  l.executions[0].price='101';r.executions[0].price='102';
  expect(()=>mergeShared(b,l,r)).toThrow('同步冲突');expect(l.executions[0].price).toBe('101');expect(r.executions[0].price).toBe('102');
 });
 it('delete propagates but delete against remote edit conflicts',()=>{
  const b=emptyJournal();b.executions=[fill('b')];const l=structuredClone(b),r=structuredClone(b);l.executions=[];
  expect(mergeShared(b,l,r).executions).toHaveLength(0);r.executions[0].note='new note';expect(()=>mergeShared(b,l,r)).toThrow('同步冲突');
 });
 it('concurrent individually valid sales cannot oversell shared holdings',()=>{
  const b=emptyJournal();b.executions=[fill('b')];const l=structuredClone(b),r=structuredClone(b);
  l.executions.push(fill('s1','sell','8'));r.executions.push(fill('s2','sell','8'));
  expect(()=>mergeShared(b,l,r)).toThrow('超过');
 });
 it('initial migration deduplicates backup copies and preserves both notes and reviews',()=>{
  const l=emptyJournal(),r=emptyJournal();l.executions=[{...fill('local'),note:'local',tags:['突破']}];r.executions=[{...fill('cloud'),note:'cloud'}];
  l.reviews.local={note:'复盘',tags:['反弹']};
  const result=mergeInitial(l,r);expect(result.executions).toHaveLength(1);expect(result.executions[0].note).toContain('local');expect(result.executions[0].note).toContain('cloud');expect(result.reviews.cloud.note).toBe('复盘');
 });
 it('initial financial setting conflicts are explicit',()=>{
  const l=emptyJournal(),r=emptyJournal();l.settings.capital='20000';r.settings.capital='15000';expect(()=>mergeInitial(l,r)).toThrow('同步冲突');
 });
 it('demo executions never enter the shared book',()=>{
  const l=emptyJournal();l.executions=[{...fill('demo'),source:'demo'}];expect(()=>mergeInitial(l,emptyJournal())).toThrow('演示成交');
 });
 it('new device defaults do not overwrite customized instruments or resurrect removed watchlist symbols',()=>{
  const l=emptyJournal(),r=emptyJournal();r.watchlist=['AMD'];r.instruments[0].name='Custom AMD';
  const result=mergeInitial(l,r);expect(result.watchlist).toEqual(['AMD']);expect(result.instruments[0].name).toBe('Custom AMD');
 });
 it('watchlist reorder is shared when the other device has no changes',()=>{
  const b=emptyJournal(),l=structuredClone(b),r=structuredClone(b);l.watchlist.reverse();expect(mergeShared(b,l,r).watchlist).toEqual(l.watchlist);
 });
 it('device appearance and proxy are private, JSONB ordering does not cause false changes',()=>{
  const l=emptyJournal();l.settings.theme='light';l.settings.proxyUrl='https://example.com';
  const shared=sharedDocument(l);expect(shared.settings.theme).toBe('dark');expect(shared.settings.proxyUrl).toBe('');expect(withDeviceSettings(shared,l).settings.proxyUrl).toBe(l.settings.proxyUrl);
  expect(canonical({a:1,b:{c:3,d:4}})).toBe(canonical({b:{d:4,c:3},a:1}));
 });
});
