import { cloudConfig } from "../data/cloudConfig";
export const defaultMarketProxy = cloudConfig.url + "/functions/v1/alpaca-market";
import Papa from "papaparse";
import { D } from "../domain/ledger";
import type { BarSet, PriceBar, Execution } from "../domain/model";
export const intervals = ["1min", "5min", "15min", "1day"] as const;
export interface Quote {
  symbol: string;
  name: string;
  price: string;
  change: string;
  percent: string;
  time: string;
  source: string;
}
export interface MarketProvider {
  history(
    symbol: string,
    interval: string,
    start: string,
    end: string,
    signal?: AbortSignal,
  ): Promise<BarSet>;
  quote(symbol: string, signal?: AbortSignal): Promise<Quote>;
  search(
    query: string,
    signal?: AbortSignal,
  ): Promise<{ symbol: string; name: string }[]>;
}
export function validateBars(bars: PriceBar[]) {
  if (!bars.length) throw new Error("供应商未返回行情，请缩小范围或检查权限");
  const sorted = [...bars].sort((a, b) => a.time - b.time);
  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    if (
      !Number.isInteger(b.time) ||
      !Number.isFinite(new Date(b.time * 1000).getTime()) ||
      ![b.time, b.open, b.high, b.low, b.close, b.volume].every(
        Number.isFinite,
      ) ||
      b.low <= 0 ||
      b.high < Math.max(b.open, b.close, b.low) ||
      b.low > Math.min(b.open, b.close) ||
      b.volume < 0 ||
      (i > 0 && sorted[i - 1].time === b.time)
    )
      throw new Error("OHLCV 数据无效或有重复时间");
  }
  return sorted;
}
export class ProxyProvider implements MarketProvider {
  constructor(private base: string) {}
  async get(path: string, args: Record<string, string>, signal?: AbortSignal) {
    const u = new URL(this.base.replace(/\/$/, "") + path, location.origin);
    Object.entries(args).forEach(([k, v]) => u.searchParams.set(k, v));
    const response = await fetch(u, {
      headers: u.origin === cloudConfig.url && u.pathname.startsWith("/functions/v1/alpaca-market/") ? { apikey: cloudConfig.key } : {},
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `行情服务响应 ${response.status}`);
    if (data.error) throw new Error(data.error);
    return data;
  }
  async history(
    symbol: string,
    interval: string,
    start: string,
    end: string,
    signal?: AbortSignal,
  ): Promise<BarSet> {
    const d = await this.get(
      "/history",
      { symbol, interval, start, end },
      signal,
    );
    return {
      symbol,
      interval,
      source: d.source || "Twelve Data（代理）",
      demo: false,
      importedAt: new Date().toISOString(),
      bars: validateBars(d.bars),
    };
  }
  async quote(symbol: string, signal?: AbortSignal): Promise<Quote> {
    const q = await this.get("/quote", { symbol }, signal);
    if (
      !q ||
      typeof q.price !== "string" ||
      !D(q.price).isFinite() ||
      D(q.price).lte(0) ||
      !D(q.change).isFinite() ||
      !D(q.percent).isFinite() ||
      !Number.isFinite(Date.parse(q.time))
    )
      throw new Error("供应商报价缺失或格式无效");
    return q;
  }
  async search(query: string, signal?: AbortSignal) {
    const rows = await this.get("/search", { query }, signal);
    if (!Array.isArray(rows)) throw new Error("搜索结果格式无效");
    return rows.filter(
      (r) => typeof r.symbol === "string" && typeof r.name === "string",
    );
  }
}
export function parseOHLCV(
  text: string,
  symbol: string,
  interval: string,
): BarSet {
  const r = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) =>
      h
        .trim()
        .toLowerCase()
        .replace(/^\uFEFF/, ""),
  });
  if (r.errors.length) throw new Error("OHLCV CSV 格式错误");
  const bars = r.data.map((b) => {
    if (
      !b.time ||
      (!/^\d+$/.test(b.time) && !/T.*(Z|[+-]\d{2}:\d{2})$/.test(b.time))
    )
      throw new Error(
        "行情 time 使用 UTC Unix 秒或带时区 ISO 时间；日线使用当天 00:00 UTC",
      );
    if (["open", "high", "low", "close"].some((k) => !b[k]))
      throw new Error("OHLCV 缺少价格列");
    return {
      time: /^\d+$/.test(b.time) ? Number(b.time) : Date.parse(b.time) / 1000,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: Number(b.volume || 0),
    };
  });
  return {
    symbol,
    interval,
    source: r.data.some((b) => b.source === "demo")
      ? "CSV 格式演示 · 非真实行情"
      : "用户导入 OHLCV（未经供应商核验）",
    demo: r.data.some((b) => b.source === "demo"),
    importedAt: new Date().toISOString(),
    bars: validateBars(bars),
  };
}
export function demoBars(
  symbol: string,
  interval: string,
  executions: Execution[],
): BarSet {
  const es = executions.filter((e) => e.symbol === symbol);
  const anchor = es.length
      ? Date.parse(es[es.length - 1].time) / 1000
      : Date.now() / 1000,
    step = interval === "1day" ? 86400 : parseInt(interval) * 60,
    base = es.length ? Number(es[es.length - 1].price) : 155,
    start = Math.floor((anchor - step * 100) / step) * step;
  let value = base;
  const bars: PriceBar[] = Array.from({ length: 180 }, (_, i) => {
    const open = value;
    value =
      base +
      Math.sin(i * 0.17) * base * 0.006 +
      Math.cos(i * 0.43) * base * 0.003;
    return {
      time: start + i * step,
      open,
      close: value,
      high: Math.max(open, value) + base * 0.0015,
      low: Math.min(open, value) - base * 0.0015,
      volume: Math.floor(25000 + Math.abs(Math.sin(i)) * 90000),
    };
  });
  return {
    symbol,
    interval,
    source: "合成演示行情 · 非真实市场价格",
    demo: true,
    importedAt: new Date().toISOString(),
    bars,
  };
}
