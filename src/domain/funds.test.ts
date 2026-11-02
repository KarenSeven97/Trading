import { expect, it } from 'vitest';
import { emptyJournal, type Execution } from './model';
import { accountFunds } from './funds';
const execution=(id:string,side:'buy'|'sell',quantity:string,price:string,fee:string,seq:number):Execution=>({id,side,quantity,price,fee,seq,symbol:'AMD',time:'2026-11-02T14:00:00Z',createdAt:'2026-11-02T14:00:00Z',updatedAt:'2026-11-02T14:00:00Z',source:'manual',note:'',tags:[]});
it('cash matches buy/sell flows after partial fee allocation',()=>{
 const j=emptyJournal();j.executions=[execution('b','buy','100','10','1',0),execution('s','sell','40','12','0.40',1)];
 expect(accountFunds(j)).toEqual({occupied:'600.6',available:'9478.6'});
 j.settings.capital='20000';expect(accountFunds(j).available).toBe('19478.6');
});
it('fully closed losses reduce cash with no occupied position',()=>{
 const j=emptyJournal();j.executions=[execution('b','buy','10','100','1',0),execution('s','sell','10','90','1',1)];
 expect(accountFunds(j)).toEqual({occupied:'0',available:'9898'});
});
