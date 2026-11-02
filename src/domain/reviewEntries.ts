import type { ClosedTrade, Journal, OpenLot } from "./model";
import { calculate, D, hasNotes, tradeTags } from "./ledger";
import { dayKey } from "./time";
export type ReviewEntry =
  { kind: "closed"; trade: ClosedTrade } | { kind: "open"; lot: OpenLot };
export const entryTime = (e: ReviewEntry) =>
  e.kind === "closed" ? e.trade.sell.time : e.lot.buy.time;
export const entrySymbol = (e: ReviewEntry) =>
  e.kind === "closed" ? e.trade.symbol : e.lot.buy.symbol;
export const entryTags = (j: Journal, e: ReviewEntry) =>
  e.kind === "closed" ? tradeTags(j, e.trade) : e.lot.buy.tags;
export const entryHasNotes = (j: Journal, e: ReviewEntry) =>
  e.kind === "closed" ? hasNotes(j, e.trade) : !!e.lot.buy.note;
export function reviewEntries(j: Journal): ReviewEntry[] {
  const { trades, openLots } = calculate(j.executions);
  return [
    ...trades.map((trade) => ({ kind: "closed" as const, trade })),
    ...openLots.map((lot) => ({ kind: "open" as const, lot })),
  ].sort(
    (a, b) =>
      Date.parse(entryTime(b)) - Date.parse(entryTime(a)) ||
      entrySymbol(a).localeCompare(entrySymbol(b)),
  );
}
export interface ReviewFilters {
  start: string;
  end: string;
  symbol: string;
  outcome: "all" | "profit" | "loss";
  status: "all" | "open" | "closed";
  tag: string;
  onlyNotes: boolean;
}
export function filterReviewEntries(
  j: Journal,
  entries: ReviewEntry[],
  f: ReviewFilters,
) {
  return entries.filter((e) => {
    const date = dayKey(entryTime(e));
    return (
      (!f.start || date >= f.start) &&
      (!f.end || date <= f.end) &&
      entrySymbol(e).includes(f.symbol.toUpperCase()) &&
      (f.status === "all" || e.kind === f.status) &&
      (!f.tag || entryTags(j, e).includes(f.tag)) &&
      (!f.onlyNotes || entryHasNotes(j, e)) &&
      (f.outcome === "all" ||
        (e.kind === "closed" &&
          (f.outcome === "profit"
            ? D(e.trade.pnl).gt(0)
            : D(e.trade.pnl).lt(0))))
    );
  });
}
