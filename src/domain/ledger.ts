import Decimal from "decimal.js";
import type {
  Execution,
  Match,
  Position,
  OpenLot,
  ClosedTrade,
  Journal,
  Settings,
} from "./model";
import { dayKey, et } from "./time";
Decimal.set({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
export const D = (x: Decimal.Value) => new Decimal(x);
export const sum = (xs: Decimal.Value[]) =>
  xs.reduce<Decimal>((a, x) => a.plus(x), D(0));
export const pct = (pnl: string, capital: string) =>
  D(pnl).div(capital).mul(100).toString();
export const money = (n: Decimal.Value, sign = true) => {
  const x = D(n),
    [integer, fraction] = x.abs().toFixed(2).split(".");
  return (
    (x.gt(0) && sign ? "+" : x.lt(0) ? "−" : "") +
    "$" +
    integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    "." +
    fraction
  );
};
export const percent = (n: Decimal.Value) => {
  const x = D(n);
  return (x.gt(0) ? "+" : "") + x.toFixed(2) + "%";
};
export const tone = (n: Decimal.Value) =>
  D(n).gt(0) ? "profit" : D(n).lt(0) ? "loss" : "neutral";
export function validateSettings(s: Settings) {
  if (
    !D(s.capital).isFinite() ||
    D(s.capital).lte(0) ||
    D(s.capital).gt("1e12")
  )
    throw new Error("初始本金必须大于 0 且不超过一万亿美元");
  for (const key of ["dailyTarget", "defaultFee"] as const)
    if (!D(s[key]).isFinite() || D(s[key]).lt(0) || D(s[key]).gt("1e9"))
      throw new Error("目标和费用必须为有效非负数");
  if (
    s.costMethod !== "FIFO" ||
    s.currency !== "USD" ||
    s.timezone !== "America/New_York" ||
    !["light", "dark"].includes(s.theme)
  )
    throw new Error("设置格式无效");
  if (
    !Array.isArray(s.extraClosedDays) ||
    s.extraClosedDays.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))
  )
    throw new Error("额外休市日格式无效");
}
export function validateExecution(e: Execution) {
  if (
    !e ||
    typeof e.id !== "string" ||
    !e.id ||
    !/^[A-Z0-9.^=-]{1,16}$/.test(e.symbol) ||
    !["buy", "sell"].includes(e.side)
  )
    throw new Error("股票代码或成交方向无效");
  for (const key of ["price", "quantity", "fee"] as const) {
    if (
      typeof e[key] !== "string" ||
      !/^\d+(\.\d{1,12})?$/.test(e[key]) ||
      !D(e[key]).isFinite() ||
      D(e[key]).gt("1e12") ||
      D(e[key]).lt(0) ||
      (key !== "fee" && D(e[key]).eq(0))
    )
      throw new Error("价格、数量须为正数，费用为非负数，最多 12 位小数");
  }
  if (!/T.*(Z|[+-]\d{2}:\d{2})$/.test(e.time) || !et(e.time).isValid)
    throw new Error("成交时间必须包含时区");
  if (
    typeof e.note !== "string" ||
    !Array.isArray(e.tags) ||
    !e.tags.every((t) => typeof t === "string") ||
    !Number.isFinite(e.seq)
  )
    throw new Error("成交笔记、标签或顺序格式错误");
}
export function calculate(executions: Execution[]) {
  const ids = new Set<string>();
  executions.forEach((e) => {
    validateExecution(e);
    if (ids.has(e.id)) throw new Error("存在重复成交 ID");
    ids.add(e.id);
  });
  const sorted = [...executions].sort(
    (a, b) =>
      Date.parse(a.time) - Date.parse(b.time) ||
      a.seq - b.seq ||
      a.id.localeCompare(b.id),
  );
  const lots = new Map<
      string,
      { e: Execution; qty: Decimal; fee: Decimal }[]
    >(),
    matches: Match[] = [];
  for (const e of sorted) {
    const queue = lots.get(e.symbol) || [];
    lots.set(e.symbol, queue);
    if (e.side === "buy") {
      queue.push({ e, qty: D(e.quantity), fee: D(e.fee) });
      continue;
    }
    let remaining = D(e.quantity),
      fee = D(e.fee);
    if (sum(queue.map((l) => l.qty)).lt(remaining))
      throw new Error(
        `${e.symbol} ${dayKey(e.time)} 卖出 ${e.quantity} 股超过当时持仓，请先补录或修正买入`,
      );
    while (remaining.gt(0)) {
      const lot = queue[0],
        q = Decimal.min(lot.qty, remaining);
      const bf = q.eq(lot.qty) ? lot.fee : lot.fee.mul(q).div(lot.qty);
      const sf = q.eq(remaining) ? fee : fee.mul(q).div(remaining);
      const cost = q.mul(lot.e.price),
        proceeds = q.mul(e.price);
      matches.push({
        id: lot.e.id + ":" + e.id,
        buy: lot.e,
        sell: e,
        quantity: q.toString(),
        cost: cost.toString(),
        proceeds: proceeds.toString(),
        buyFee: bf.toString(),
        sellFee: sf.toString(),
        pnl: proceeds.minus(cost).minus(bf).minus(sf).toString(),
      });
      lot.qty = lot.qty.minus(q);
      lot.fee = lot.fee.minus(bf);
      remaining = remaining.minus(q);
      fee = fee.minus(sf);
      if (lot.qty.eq(0)) queue.shift();
    }
  }
  const openLots: OpenLot[] = [...lots.values()].flatMap((ls) =>
    ls.map((l) => ({
      buy: l.e,
      quantity: l.qty.toString(),
      cost: l.qty.mul(l.e.price).toString(),
      remainingFee: l.fee.toString(),
    })),
  );
  const positions: Position[] = [...lots]
    .filter(([, ls]) => ls.length)
    .map(([symbol, ls]) => ({
      symbol,
      quantity: sum(ls.map((l) => l.qty)).toString(),
      cost: sum(ls.map((l) => l.qty.mul(l.e.price))).toString(),
      remainingFee: sum(ls.map((l) => l.fee)).toString(),
    }));
  const groups = new Map<string, Match[]>();
  for (const m of matches)
    groups.set(m.sell.id, [...(groups.get(m.sell.id) || []), m]);
  const trades: ClosedTrade[] = [...groups]
    .map(([id, ms]) => {
      const quantity = sum(ms.map((m) => m.quantity)),
        cost = sum(ms.map((m) => m.cost)),
        buyFee = sum(ms.map((m) => m.buyFee)),
        fees = buyFee.plus(sum(ms.map((m) => m.sellFee))),
        pnl = sum(ms.map((m) => m.pnl));
      return {
        id,
        symbol: ms[0].sell.symbol,
        sell: ms[0].sell,
        matches: ms,
        quantity: quantity.toString(),
        cost: cost.toString(),
        proceeds: sum(ms.map((m) => m.proceeds)).toString(),
        fees: fees.toString(),
        pnl: pnl.toString(),
        avgBuy: cost.div(quantity).toString(),
        returnPct: pnl.div(cost.plus(buyFee)).mul(100).toString(),
        buys: [...new Map(ms.map((m) => [m.buy.id, m.buy])).values()],
      };
    })
    .reverse();
  return { matches, positions, trades, openLots };
}
export function daily(trades: ClosedTrade[]) {
  const days: Record<string, { pnl: string; count: number }> = {};
  for (const t of trades) {
    const key = dayKey(t.sell.time);
    days[key] = {
      pnl: D(days[key]?.pnl || 0)
        .plus(t.pnl)
        .toString(),
      count: (days[key]?.count || 0) + 1,
    };
  }
  return days;
}
export const tradeTags = (j: Journal, t: ClosedTrade) => [
  ...new Set([
    ...t.buys.flatMap((b) => b.tags),
    ...t.sell.tags,
    ...(j.reviews[t.id]?.tags || []),
  ]),
];
export const hasNotes = (j: Journal, t: ClosedTrade) =>
  !!(t.buys.some((b) => b.note) || t.sell.note || j.reviews[t.id]?.note);
export function validateJournal(j: Journal) {
  if (
    !j ||
    j.version !== 1 ||
    !Number.isSafeInteger(j.revision) ||
    j.revision < 0 ||
    !["live", "demo"].includes(j.mode) ||
    !Array.isArray(j.executions) ||
    !Array.isArray(j.watchlist) ||
    !Array.isArray(j.instruments) ||
    !Array.isArray(j.bars) ||
    !j.reviews ||
    typeof j.reviews !== "object"
  )
    throw new Error("备份结构或版本无效");
  validateSettings(j.settings);
  if (j.mode === "live" && j.executions.some((e) => e.source === "demo"))
    throw new Error("演示成交不能混入正式账本");
  if (j.mode === "live" && j.bars.some((b) => b.demo))
    throw new Error("演示行情不能混入正式账本");
  if (
    j.instruments.some(
      (i) =>
        !i ||
        typeof i.symbol !== "string" ||
        !/^[A-Z0-9.^=-]{1,16}$/.test(i.symbol) ||
        typeof i.name !== "string" ||
        typeof i.exchange !== "string" ||
        !["股票", "ETF", "反向 ETF"].includes(i.type),
    )
  )
    throw new Error("股票信息格式错误");
  calculate(j.executions);
  if (
    j.watchlist.some(
      (s) => typeof s !== "string" || !/^[A-Z0-9.^=-]{1,16}$/.test(s),
    ) ||
    new Set(j.watchlist).size !== j.watchlist.length
  )
    throw new Error("自选列表无效");
  for (const r of Object.values(j.reviews))
    if (
      typeof r.note !== "string" ||
      !Array.isArray(r.tags) ||
      r.tags.some((t) => typeof t !== "string")
    )
      throw new Error("复盘笔记格式错误");
  for (const b of j.bars) {
    if (
      typeof b.symbol !== "string" ||
      typeof b.source !== "string" ||
      typeof b.demo !== "boolean" ||
      !["1min", "5min", "15min", "1day"].includes(b.interval) ||
      !Array.isArray(b.bars)
    )
      throw new Error("行情备份格式错误");
    let last = -Infinity;
    for (const p of b.bars) {
      if (
        ![p.time, p.open, p.high, p.low, p.close, p.volume].every(
          Number.isFinite,
        ) ||
        !Number.isInteger(p.time) ||
        !Number.isFinite(new Date(p.time * 1000).getTime()) ||
        p.time <= last ||
        p.low <= 0 ||
        p.high < Math.max(p.open, p.close, p.low) ||
        p.low > Math.min(p.open, p.close) ||
        p.volume < 0
      )
        throw new Error("行情数据无效");
      last = p.time;
    }
  }
}
