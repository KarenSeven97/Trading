import type { Position } from './model';
import { D } from './ledger';
export function positionFirstOrder(symbols:string[],positions:Position[]):string[]{
 const map=new Map(positions.map(p=>[p.symbol,p]));
 return [...symbols].sort((a,b)=>{
  const pa=map.get(a),pb=map.get(b),openA=!!pa&&D(pa.quantity).gt(0),openB=!!pb&&D(pb.quantity).gt(0);
  if(openA!==openB)return openA?-1:1;if(!openA||!openB)return 0;
  return D(pb!.cost).plus(pb!.remainingFee).cmp(D(pa!.cost).plus(pa!.remainingFee)) || D(pb!.quantity).cmp(pa!.quantity);
 });
}
export function moveWatchSymbol(symbols:string[],from:string,to:string):string[]{
 const source=symbols.indexOf(from),target=symbols.indexOf(to);if(source<0||target<0||source===target)return [...symbols];
 const next=[...symbols];next.splice(source,1);next.splice(target,0,from);return next;
}
