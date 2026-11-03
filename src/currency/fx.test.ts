import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseFx, displayMoney, fetchFx } from './fx';
import { emptyJournal } from '../domain/model';
import { calculate, pct } from '../domain/ledger';
afterEach(()=>vi.unstubAllGlobals());
const rate={date:'2026-11-03',rate:'6.6506',fetchedAt:'2026-11-03T00:00:00Z'};
describe('USD/CNY display boundary',()=>{
 it('uses Decimal and converts principal, profit, loss and zero with explicit symbols',()=>{
  expect(displayMoney('10000',false,'CNY',rate)).toBe('¥66,506.00');
  expect(displayMoney('150',true,'CNY',rate)).toBe('+¥997.59');
  expect(displayMoney('-80',true,'CNY',rate)).toBe('−¥532.05');
  expect(displayMoney('0',true,'CNY',rate)).toBe('¥0.00');
  expect(displayMoney('0.1',false,'CNY',{...rate,rate:'7.15'})).toBe('¥0.72');
 });
 it('repeated toggling always uses original USD, preserving journal and returns',()=>{
  const j=emptyJournal(),before=JSON.stringify(j);for(let i=0;i<10;i++){displayMoney('150',true,'CNY',rate);expect(displayMoney('150',true,'USD',rate)).toBe('+$150.00');}
  expect(pct('150',j.settings.capital)).toBe('1.5');expect(calculate(j.executions).trades).toEqual([]);expect(JSON.stringify(j)).toBe(before);
 });
 it('rejects missing, reversed, zero or negative reference rates',()=>{
  for(const data of [{},{base:'CNY',quote:'USD',rate:7,date:'2026-11-03'},{base:'USD',quote:'CNY',rate:0,date:'2026-11-03'},{base:'USD',quote:'CNY',rate:-1,date:'2026-11-03'}])expect(()=>parseFx(data)).toThrow();
  expect(()=>displayMoney('100',false,'CNY')).toThrow('尚未获取');
 });
 it('preserves the actual provider date on a weekend rather than claiming today',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({base:'USD',quote:'CNY',rate:7.1,date:'2026-10-30'})}));
  expect((await fetchFx()).date).toBe('2026-10-30');
 });
 it('network errors do not fabricate a rate',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));await expect(fetchFx()).rejects.toThrow('暂不可用');
 });
});
