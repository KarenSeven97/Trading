import { it, expect } from 'vitest';
import { beijingInput, beijingToUTC, easternPreview, dayKey } from './time';
it('winter Beijing input converts to UTC and previous New York date',()=>{
 const utc=beijingToUTC('2026-11-03T01:08:15');expect(utc).toBe('2026-11-02T17:08:15.000Z');expect(easternPreview('2026-11-03T01:08:15')).toContain('2026-11-02 12:08:15 EST');expect(dayKey(utc)).toBe('2026-11-02');
});
it('summer input uses EDT without asking the user to calculate offsets',()=>{expect(easternPreview('2026-07-01T21:30:00')).toContain('2026-07-01 09:30:00 EDT');});
it('editing existing UTC values roundtrips through Beijing input',()=>{const utc='2026-11-02T17:08:15.000Z';expect(beijingToUTC(beijingInput(utc))).toBe(utc);});
it('DST repeated eastern times map to two distinct Beijing times without ambiguity',()=>{expect(beijingToUTC('2026-11-01T13:30:00')).not.toBe(beijingToUTC('2026-11-01T14:30:00'));expect(easternPreview('2026-11-01T13:30:00')).toContain('EDT');expect(easternPreview('2026-11-01T14:30:00')).toContain('EST');});
it('rejects impossible dates rather than rolling into another day',()=>{expect(()=>beijingToUTC('2026-02-30T12:00:00')).toThrow('北京时间无效');expect(easternPreview('')).toBeNull();});
