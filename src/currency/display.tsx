import { createContext, useContext } from 'react';
import { money } from '../domain/ledger';
export const MoneyContext=createContext<typeof money>(money);
export const useDisplayMoney=()=>useContext(MoneyContext);
