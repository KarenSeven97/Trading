export type Side = "buy" | "sell";
export interface Execution {
  id: string;
  symbol: string;
  side: Side;
  price: string;
  quantity: string;
  fee: string;
  time: string;
  note: string;
  tags: string[];
  source: "manual" | "csv" | "demo";
  createdAt: string;
  updatedAt: string;
  seq: number;
}
export interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  type: "股票" | "ETF" | "反向 ETF";
}
export interface Settings {
  capital: string;
  dailyTarget: string;
  currency: "USD";
  timezone: "America/New_York";
  defaultFee: string;
  costMethod: "FIFO";
  theme: "dark" | "light";
  proxyUrl: string;
  extraClosedDays: string[];
}
export interface Review {
  note: string;
  tags: string[];
}
export interface PriceBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface BarSet {
  symbol: string;
  interval: string;
  source: string;
  importedAt: string;
  demo: boolean;
  bars: PriceBar[];
}
export interface Journal {
  version: 1;
  revision: number;
  mode: "live" | "demo";
  settings: Settings;
  instruments: Instrument[];
  executions: Execution[];
  reviews: Record<string, Review>;
  watchlist: string[];
  bars: BarSet[];
}
export interface Match {
  id: string;
  buy: Execution;
  sell: Execution;
  quantity: string;
  cost: string;
  proceeds: string;
  buyFee: string;
  sellFee: string;
  pnl: string;
}
export interface OpenLot {
  buy: Execution;
  quantity: string;
  cost: string;
  remainingFee: string;
}
export interface Position {
  symbol: string;
  quantity: string;
  cost: string;
  remainingFee: string;
}
export interface ClosedTrade {
  id: string;
  symbol: string;
  sell: Execution;
  matches: Match[];
  quantity: string;
  cost: string;
  proceeds: string;
  fees: string;
  pnl: string;
  avgBuy: string;
  returnPct: string;
  buys: Execution[];
}
export const defaults: Settings = {
  capital: "10000",
  dailyTarget: "1",
  currency: "USD",
  timezone: "America/New_York",
  defaultFee: "0",
  costMethod: "FIFO",
  theme: "dark",
  proxyUrl: import.meta.env.VITE_MARKET_PROXY_URL || "",
  extraClosedDays: [],
};
export const instruments: Instrument[] = [
  { symbol: "AMD", name: "超威半导体", exchange: "NASDAQ", type: "股票" },
  { symbol: "NVDA", name: "英伟达", exchange: "NASDAQ", type: "股票" },
  { symbol: "AAPL", name: "苹果", exchange: "NASDAQ", type: "股票" },
  { symbol: "MSFT", name: "微软", exchange: "NASDAQ", type: "股票" },
  {
    symbol: "QQQM",
    name: "Invesco NASDAQ 100 ETF",
    exchange: "NASDAQ",
    type: "ETF",
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    exchange: "NYSE Arca",
    type: "ETF",
  },
  {
    symbol: "SOXS",
    name: "半导体三倍反向 ETF",
    exchange: "NYSE Arca",
    type: "反向 ETF",
  },
  {
    symbol: "SQQQ",
    name: "纳指三倍反向 ETF",
    exchange: "NASDAQ",
    type: "反向 ETF",
  },
  {
    symbol: "QID",
    name: "纳指两倍反向 ETF",
    exchange: "NYSE Arca",
    type: "反向 ETF",
  },
];
export function emptyJournal(mode: "live" | "demo" = "live"): Journal {
  return {
    version: 1,
    revision: 0,
    mode,
    settings: { ...defaults },
    instruments: [...instruments],
    executions: [],
    reviews: {},
    watchlist: ["AMD", "NVDA", "QQQM", "SOXS"],
    bars: [],
  };
}
export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
  return (
    h.slice(0, 8) +
    "-" +
    h.slice(8, 12) +
    "-" +
    h.slice(12, 16) +
    "-" +
    h.slice(16, 20) +
    "-" +
    h.slice(20)
  );
};
