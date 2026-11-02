import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { emptyJournal, type Journal } from '../domain/model';
import { readCloud, writeCloud, type CloudRow } from './cloudApi';
import { load, loadLocal, persist, syncShared, getSyncStatus } from './storage';
vi.mock('./cloudConfig',()=>({cloudEnabled:true,cloudConfig:{url:'',key:''}}));
vi.mock('./cloudApi',()=>({readCloud:vi.fn(),writeCloud:vi.fn()}));
let remote:CloudRow;
beforeEach(()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());vi.clearAllMocks();
 remote={id:'main',revision:0,document:emptyJournal(),updated_at:'2026-11-02T00:00:00Z'};
 vi.mocked(readCloud).mockImplementation(async()=>structuredClone(remote));
 vi.mocked(writeCloud).mockImplementation(async(rev:number,document:Journal)=>{
  if(rev!==remote.revision)return null;
  remote={...remote,revision:rev+1,document:structuredClone(document)};return structuredClone(remote);
 });
});
describe('Shared persistence and recovery',()=>{
 it('unchanged polling preserves local revision and avoids cloud writes',async()=>{
  const first=await load('live'),second=await syncShared();expect(second.revision).toBe(first.revision);expect(writeCloud).not.toHaveBeenCalled();
 });
 it('offline saves survive reload and upload when connectivity returns',async()=>{
  const j=await load('live');vi.mocked(readCloud).mockRejectedValueOnce(new Error('offline'));
  const saved=await persist({...j,reviews:{b:{note:'离线复盘',tags:[]}}});
  expect(saved.reviews.b.note).toBe('离线复盘');expect((await loadLocal('live')).reviews.b.note).toBe('离线复盘');expect(getSyncStatus().kind).toBe('error');
  await syncShared();expect(remote.document.reviews.b.note).toBe('离线复盘');expect(getSyncStatus().kind).toBe('synced');
 });
 it('CAS collision retries against newest remote document without losing either note',async()=>{
  const j=await load('live');vi.mocked(writeCloud).mockImplementationOnce(async()=>{
   remote={...remote,revision:1,document:{...remote.document,reviews:{remote:{note:'另一设备',tags:[]}}}};return null;
  });
  const result=await persist({...j,reviews:{local:{note:'本机',tags:[]}}});
  expect(result.reviews.local.note).toBe('本机');expect(result.reviews.remote.note).toBe('另一设备');expect(remote.document.reviews.local.note).toBe('本机');
 });
 it('same-note conflict preserves local pending edits and remote value',async()=>{
  const j=await load('live');const first=await persist({...j,reviews:{x:{note:'original',tags:[]}}});
  remote.document.reviews.x={note:'remote edit',tags:[]};remote.revision++;
  await persist({...first,reviews:{x:{note:'local edit',tags:[]}}});
  expect(getSyncStatus().kind).toBe('error');expect((await loadLocal('live')).reviews.x.note).toBe('local edit');expect(remote.document.reviews.x.note).toBe('remote edit');
 });
 it('demo saves do not read or write cloud',async()=>{
  await persist(emptyJournal('demo'));expect(readCloud).not.toHaveBeenCalled();expect(writeCloud).not.toHaveBeenCalled();
 });
});
