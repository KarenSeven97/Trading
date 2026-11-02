import { it, expect, vi, afterEach } from 'vitest';
import { ProxyProvider, defaultMarketProxy } from './provider';
afterEach(()=>vi.unstubAllGlobals());
it('sends only the public application key to the built-in proxy',async()=>{
 vi.stubGlobal('location',{origin:'https://karenseven97.github.io'});
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>[]});vi.stubGlobal('fetch',request);
 await new ProxyProvider(defaultMarketProxy).search('AMD');
 expect(request.mock.calls[0][1].headers.apikey).toMatch(/^sb_publishable_/);
 await new ProxyProvider('https://example.org').search('AMD');expect(request.mock.calls[1][1].headers).toEqual({});
});
it('shows the server configuration error instead of a generic HTTP code',async()=>{
 vi.stubGlobal('location',{origin:'https://karenseven97.github.io'});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:502,json:async()=>({error:'Alpaca 403：当前账户无此行情权限'})}));
 await expect(new ProxyProvider(defaultMarketProxy).search('AMD')).rejects.toThrow('当前账户无此行情权限');
});
