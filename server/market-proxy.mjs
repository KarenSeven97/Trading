import http from "node:http";
import { DateTime } from "luxon";
const key = process.env.TWELVE_DATA_API_KEY;
const port = Number(process.env.MARKET_PORT || 8787);
const allowed = (
  process.env.MARKET_ALLOWED_ORIGINS ||
  "http://localhost:5173,http://127.0.0.1:5173"
).split(",");
async function upstream(endpoint, params) {
  if (!key) throw new Error("缺少服务端 TWELVE_DATA_API_KEY");
  const url = new URL("https://api.twelvedata.com/" + endpoint);
  Object.entries({ ...params, apikey: key }).forEach(([k, v]) =>
    url.searchParams.set(k, v),
  );
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("行情供应商 HTTP " + r.status);
  const d = await r.json();
  if (d.status === "error" || d.code >= 400)
    throw new Error(d.message || "行情权限或额度不足");
  return d;
}
const cache = new Map();
export async function handle(path, args) {
  const symbol = (args.get("symbol") || "").toUpperCase();
  if (path !== "/search" && !/^[A-Z0-9.^=-]{1,16}$/.test(symbol))
    throw new Error("无效股票代码");
  if (path === "/history") {
    const interval = args.get("interval");
    if (!["1min", "5min", "15min", "1day"].includes(interval))
      throw new Error("无效周期");
    const start = args.get("start"),
      end = args.get("end");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      start > end
    )
      throw new Error("日期范围无效");
    const d = await upstream("time_series", {
      symbol,
      interval,
      start_date:
        interval === "1day"
          ? start
          : DateTime.fromISO(start, { zone: "America/New_York" })
              .startOf("day")
              .toUTC()
              .toFormat("yyyy-MM-dd HH:mm:ss"),
      end_date:
        interval === "1day"
          ? end
          : DateTime.fromISO(end, { zone: "America/New_York" })
              .endOf("day")
              .toUTC()
              .toFormat("yyyy-MM-dd HH:mm:ss"),
      timezone: "UTC",
      order: "ASC",
      outputsize: "5000",
      adjust: "none",
    });
    return {
      source: "Twelve Data · 未复权 · 权限与延迟以供应商为准",
      bars: (d.values || []).map((v) => ({
        time:
          Date.parse(
            v.datetime.replace(" ", "T") +
              (v.datetime.length === 10 ? "T00:00:00Z" : "Z"),
          ) / 1000,
        open: +v.open,
        high: +v.high,
        low: +v.low,
        close: +v.close,
        volume: +(v.volume || 0),
      })),
    };
  }
  if (path === "/quote") {
    const d = await upstream("quote", { symbol, timezone: "UTC" });
    return {
      symbol,
      name: d.name || symbol,
      price: d.close,
      change: d.change || "0",
      percent: d.percent_change || "0",
      time: d.timestamp
        ? new Date(d.timestamp * 1000).toISOString()
        : new Date().toISOString(),
      source: "Twelve Data · 实时/延迟以订阅权限为准",
    };
  }
  if (path === "/search") {
    const query = args.get("query") || "";
    if (query.length < 1 || query.length > 40) throw new Error("搜索条件无效");
    const d = await upstream("symbol_search", {
      symbol: query,
      outputsize: "15",
    });
    return (d.data || [])
      .filter((x) => x.country === "United States")
      .map((x) => ({ symbol: x.symbol, name: x.instrument_name }));
  }
  throw new Error("未知接口");
}
http
  .createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !allowed.includes(origin)) {
      res.writeHead(403);
      res.end("Origin not allowed");
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end("{}");
      return;
    }
    try {
      const u = new URL(req.url, "http://localhost");
      const cacheKey = u.pathname + u.search,
        hit = cache.get(cacheKey);
      let data;
      if (hit && hit.until > Date.now()) data = hit.data;
      else {
        data = await handle(u.pathname, u.searchParams);
        if (cache.size > 300) cache.clear();
        cache.set(cacheKey, { until: Date.now() + 60000, data });
      }
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: e.message }));
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      `Market proxy http://127.0.0.1:${port} · API key ${key ? "configured" : "missing"}`,
    ),
  );
