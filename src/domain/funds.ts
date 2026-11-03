import type { Journal } from './model';
import { calculate, sum, D } from './ledger';
export function accountFunds(j: Journal) {
 const ledger=calculate(j.executions);
 const occupied=sum(ledger.positions.map(p=>D(p.cost).plus(p.remainingFee)));
 return {occupied:occupied.toString(),available:D(j.settings.capital).minus(occupied).toString()};
}
