import { expect, it } from 'vitest';
import { positionFirstOrder,moveWatchSymbol } from './watchOrder';
import type { Position } from './model';
const p=(symbol:string,cost:string,quantity='1',remainingFee='0'):Position=>({symbol,cost,quantity,remainingFee});
it('open positions precede nonpositions and sort by occupied cost then quantity',()=>{
 const source=['A','B','C','D','E'];
 expect(positionFirstOrder(source,[p('A','100','10'),p('B','500','2'),p('C','500','3')])).toEqual(['C','B','A','D','E']);expect(source).toEqual(['A','B','C','D','E']);
});
it('uses exact decimals and fees rather than lexical ordering or floating point',()=>{
 expect(positionFirstOrder(['A','B'],[p('A','99.9','1','0.2'),p('B','100','1','0')])).toEqual(['A','B']);
});
it('manual order is retained for ties and closed positions',()=>{
 expect(positionFirstOrder(['C','B','A'],[p('B','100'),p('A','100')])).toEqual(['B','A','C']);
 expect(positionFirstOrder(['C','B','A'],[p('C','0','0')])).toEqual(['C','B','A']);
});
it('dragging reorders both directions without removing any symbol',()=>{
 expect(moveWatchSymbol(['A','B','C'],'A','C')).toEqual(['B','C','A']);
 expect(moveWatchSymbol(['A','B','C'],'C','A')).toEqual(['C','A','B']);
 expect(moveWatchSymbol(['A','B'],'missing','A')).toEqual(['A','B']);
 expect(moveWatchSymbol(['A','B'],'A','A')).toEqual(['A','B']);
});
