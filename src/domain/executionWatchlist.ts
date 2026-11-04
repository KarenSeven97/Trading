import { instruments as defaults, type Execution, type Journal } from './model';
import { instrumentName } from './instrumentNames';

/** Add only the submitted executions, preserving manual watchlist order and metadata. */
export function watchExecutionSymbols(journal: Journal, submitted: Execution[]): Journal {
  const watchlist = [...journal.watchlist];
  const instruments = [...journal.instruments];
  for (const {symbol} of submitted) {
    if (!watchlist.includes(symbol)) watchlist.push(symbol);
    if (!instruments.some(i => i.symbol === symbol)) {
      const known = defaults.find(i => i.symbol === symbol);
      instruments.push(known ? {...known} : {symbol, name: instrumentName(symbol), exchange: '', type: '股票'});
    }
  }
  return {...journal, watchlist, instruments};
}
