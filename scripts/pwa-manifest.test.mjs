import { describe, expect, it } from 'vitest';
import { createPwaManifest } from './pwa-manifest.mjs';
const template = {name:'Trading',display:'standalone',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}]};
describe('PWA identity and deployment paths', () => {
  it('uses the full GitHub Pages path as the app identity, start URL, scope and asset base', () => {
    const m=createPwaManifest(template,'/Trading/');
    expect(m.id).toBe('/Trading/');
    expect(new URL(m.id,'https://karenseven97.github.io').href).toBe('https://karenseven97.github.io/Trading/');
    expect(m.start_url).toBe('/Trading/');expect(m.scope).toBe('/Trading/');
    expect(m.icons.map(i=>i.src)).toEqual(['/Trading/icon-192.png','/Trading/icon-512.png']);
  });
  it('keeps Sites root deployment installable and preserves required icon metadata', () => {
    const m=createPwaManifest(template);
    expect(m.id).toBe('/');expect(m.start_url).toBe('/');expect(m.scope).toBe('/');
    expect(m.icons.map(i=>i.sizes)).toEqual(['192x192','512x512']);
    expect(m.prefer_related_applications).toBe(false);
    expect(m.display).toBe('standalone');
  });
  it('assigns distinct identities to different apps on the same origin', () => {
    expect(createPwaManifest(template,'/Trading').id).not.toBe(createPwaManifest(template,'/IslandDiary/').id);
    expect(template.icons[0].src).toBe('icon-192.png');
  });
  it('rejects external, relative, traversing and query-bearing deployment paths', () => {
    for(const base of ['https://bad.example/','//bad.example/','Trading/','/Trading/../','/Trading/?x=1','/Trading/#x']) expect(()=>createPwaManifest(template,base)).toThrow();
  });
});
