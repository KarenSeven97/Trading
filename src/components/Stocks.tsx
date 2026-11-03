import { SortableWatchItem } from "./SortableWatchItem";
import { positionFirstOrder, moveWatchSymbol } from "../domain/watchOrder";
import { instrumentName } from "../domain/instrumentNames";
import { useEffect, useState, useMemo, useRef } from "react";
import { DateTime } from "luxon";
import {
  Plus,
  Search,
  RefreshCw,
  Upload,
  ChevronUp,
  ChevronDown,
  X,
  ChartCandlestick,
  ExternalLink,
  Info,
} from "lucide-react";
import type { Journal, BarSet, Execution } from "../domain/model";
import { calculate, money, D, percent, tone } from "../domain/ledger";
import { et, dayKey, displayTime } from "../domain/time";
import {

  ProxyProvider,
  defaultMarketProxy,
  parseOHLCV,
  demoBars,
  type Quote,
} from "../market/provider";
import { download } from "../data/transfer";
import { PriceChart } from "./PriceChart";
import { Empty, Modal, Field } from "./common";
export function Stocks({
  journal,
  symbol,
  setSymbol,
  focusId,
  onExecution,
  onSave,
  notify,
  onSettings,
}: {
  journal: Journal;
  symbol: string;
  setSymbol: (s: string) => void;
  focusId?: string;
  onExecution: (e: Execution) => void;
  onSave: (j: Journal) => Promise<void>;
  notify: (s: string) => void;
  onSettings: () => void;
}) {
  const [watchOrder,setWatchOrder]=useState<'position'|'manual'>(()=>{try{return localStorage.getItem('tj-watch-order')==='manual'?'manual':'position';}catch{return 'position';}});
  function chooseOrder(mode:'position'|'manual'){setWatchOrder(mode);try{localStorage.setItem('tj-watch-order',mode);}catch{}}
  const [interval, setInterval] = useState("15min"),
    [start, setStart] = useState(et().minus({days:6}).toISODate()!),
    [end, setEnd] = useState(et().toISODate()!),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [quotes, setQuotes] = useState<Record<string, Quote>>({}),
    [query, setQuery] = useState(""),
    [searchResults, setSearchResults] = useState<
      { symbol: string; name: string }[]
    >([]),
    [selectedMarkers, setSelectedMarkers] = useState<Execution[]>([]),
    [importing, setImporting] = useState<BarSet | null>(null),
    [providerData, setProviderData] = useState<BarSet | null>(null),
    [searching, setSearching] = useState(false),
    [quoteBusy, setQuoteBusy] = useState(false);
  const historyCache = useRef(new Map<string, { data: BarSet; until: number }>());
  const upload = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null),
    quoteRequest = useRef<AbortController | null>(null);
  const provider = useMemo(
    () =>
      new ProxyProvider(journal.settings.proxyUrl || defaultMarketProxy),
    [journal.settings.proxyUrl],
  );
  const ledger = useMemo(
    () => calculate(journal.executions),
    [journal.executions],
  );
  const orderedWatchlist=useMemo(()=>watchOrder==='position'?positionFirstOrder(journal.watchlist,ledger.positions):journal.watchlist,[journal.watchlist,ledger.positions,watchOrder]);
  async function reorder(from:string,to:string){if(from===to)return;await onSave({...journal,watchlist:moveWatchSymbol(orderedWatchlist,from,to)});chooseOrder('manual');}
  const cached = journal.bars.find(
      (b) => b.symbol === symbol && b.interval === interval,
    ),
    sourceData =
      providerData?.symbol === symbol && providerData.interval === interval
        ? providerData
        : cached;
  const synthetic = useMemo(
    () =>
      journal.mode === "demo"
        ? demoBars(symbol, interval, journal.executions)
        : null,
    [symbol, interval, journal.mode, journal.executions],
  );
  const rawData = sourceData || synthetic;
  const data = useMemo(() => {
    if (!rawData) return null;
    const filtered = rawData.bars.filter((b) => {
      const date =
        interval === "1day"
          ? new Date(b.time * 1000).toISOString().slice(0, 10)
          : dayKey(new Date(b.time * 1000).toISOString());
      return date >= start && date <= end;
    });
    return filtered.length ? { ...rawData, bars: filtered } : null;
  }, [rawData, start, end, interval]);
  const quote = quotes[symbol];
  const instrument = journal.instruments.find((i) => i.symbol === symbol);
  const es = journal.executions
    .filter(
      (e) =>
        e.symbol === symbol && dayKey(e.time) >= start && dayKey(e.time) <= end,
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.seq - b.seq);
  const chartData: BarSet | null = data || (es.length ? {symbol,interval,source:"无历史行情 · 仅展示实际成交",demo:false,importedAt:"",bars:[]} : null);
  useEffect(() => {
    if (!focusId) return;
    const e = journal.executions.find((e) => e.id === focusId),
      t = ledger.trades.find(
        (t) => t.id === focusId || t.buys.some((b) => b.id === focusId),
      );
    if (e) {
      const first = t
        ? t.buys.reduce((a, b) =>
            Date.parse(a.time) < Date.parse(b.time) ? a : b,
          )
        : e;
      setStart(et(first.time).minus({ days: 1 }).toISODate()!);
      setEnd(
        et(t?.sell.time || e.time)
          .plus({ days: 1 })
          .toISODate()!,
      );
    }
  }, [focusId, symbol]);
  useEffect(
    () => () => {
      request.current?.abort();
      quoteRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    request.current?.abort();
    setBusy(false);
    setError("");
    if (start > end) return;
    const timer = window.setTimeout(() => void fetchHistory(), 350);
    return () => { window.clearTimeout(timer); request.current?.abort(); };
  }, [symbol, interval, start, end, provider]);
  useEffect(() => {
    if (!focusId) { setInterval("15min"); setStart(et().minus({days:6}).toISODate()!); setEnd(et().toISODate()!); }
    const controller = new AbortController();
    const first=et().minus({days:6}).toISODate()!, last=et().toISODate()!;
    void provider.history(symbol,"1day",first,last,controller.signal).then(d=>{
      if (!controller.signal.aborted) historyCache.current.set(`${symbol}|1day|${first}|${last}`,{data:d,until:Date.now()+60000});
    }).catch(()=>{});
    void provider.quote(symbol,controller.signal).then(q=>{ if(!controller.signal.aborted)setQuotes(v=>({...v,[symbol]:q})); }).catch(()=>{});
    return ()=>controller.abort();
  }, [symbol, provider]);
  useEffect(() => {
    setQuotes({});
  }, [provider]);
  async function fetchHistory() {
    if (!provider) {
      setError(
        "尚未配置行情代理。请到设置填写你部署的服务地址，或导入真实 OHLCV CSV。",
      );
      return;
    }
    const selectedSymbol = symbol,
      selectedInterval = interval;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      const key = `${selectedSymbol}|${selectedInterval}|${start}|${end}`;
      const hit = historyCache.current.get(key);
      const d = (hit && hit.until > Date.now() ? hit.data : null) || await provider.history(selectedSymbol, selectedInterval, start, end, controller.signal);
      if (!controller.signal.aborted) {
        historyCache.current.set(key,{data:d,until:Date.now()+60000});
        setProviderData(d);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === controller) setBusy(false);
    }
  }
  async function refreshQuotes() {
    if (!provider) {
      setError("行情报价需要配置代理；未配置时不会显示虚构报价。");
      return;
    }
    setQuoteBusy(true);
    setError("");
    quoteRequest.current?.abort();
    const controller = new AbortController();
    quoteRequest.current = controller;
    try {
      const symbols = journal.watchlist.includes(symbol)
        ? journal.watchlist
        : [symbol, ...journal.watchlist];
      for (const s of symbols) {
        const q = await provider.quote(s, controller.signal);
        if (!controller.signal.aborted) setQuotes((v) => ({ ...v, [s]: q }));
      }
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      setQuoteBusy(false);
    }
  }
  async function add(s = query) {
    s = s.trim().toUpperCase();
    if (!/^[A-Z0-9.^=-]{1,16}$/.test(s)) {
      notify("请输入有效的美股或 ETF 代码");
      return;
    }
    if (!journal.watchlist.includes(s)) {
      await onSave({
        ...journal,
        watchlist: [...journal.watchlist, s],
        instruments: journal.instruments.some((i) => i.symbol === s)
          ? journal.instruments
          : [
              ...journal.instruments,
              {
                symbol: s,
                name: searchResults.find((r) => r.symbol === s)?.name || s,
                exchange: "待确认",
                type: "股票",
              },
            ],
      });
    }
    setSymbol(s);
    setQuery("");
    setSearchResults([]);
  }
  async function move(s: string, dir: number) {
    const list = [...orderedWatchlist],
      i = list.indexOf(s),
      n = i + dir;
    if (n < 0 || n >= list.length) return;
    [list[i], list[n]] = [list[n], list[i]];
    await onSave({ ...journal, watchlist: list });
    chooseOrder('manual');
  }
  async function search() {
    if (!query) return;
    if (!provider) {
      setSearchResults(
        journal.instruments
          .filter(
            (i) =>
              i.symbol.includes(query.toUpperCase()) || i.name.includes(query),
          )
          .map((i) => ({ symbol: i.symbol, name: i.name })),
      );
      return;
    }
    setSearching(true);
    try {
      setSearchResults(await provider.search(query));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  async function importCSV(file?: File) {
    if (!file) return;
    try {
      const imported = parseOHLCV(await file.text(), symbol, interval);
      if (imported.demo && journal.mode === "live")
        throw new Error("格式模板是演示数据，请切换到演示账本导入");
      setImporting(imported);
    } catch (e) {
      setError((e as Error).message);
    }
    if (upload.current) upload.current.value = "";
  }
  function markerClick(executions: Execution[]) {
    if (executions.length === 1) onExecution(executions[0]);
    else setSelectedMarkers(executions);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            股票与点位<span className="heading-dot">.</span>
          </h1>
        </div>
        <button
          className="btn secondary"
          disabled={quoteBusy}
          onClick={refreshQuotes}
        >
          <RefreshCw size={16} className={quoteBusy ? "spin" : ""} />
          {quoteBusy ? "更新中…" : "更新自选报价"}
        </button>
      </div>
      <div className="stocks-layout">
        <aside className="card watchlist">
          <div className="card-header">
            <h2>我的自选</h2>
            <select className="watch-order-select" aria-label="自选排序方式" value={watchOrder} onChange={e=>chooseOrder(e.target.value as 'position'|'manual')}><option value="position">持仓优先</option><option value="manual">手动排序</option></select>
          </div>
          <div className="watch-search">
            <input
              aria-label="搜索股票"
              placeholder="代码 / 名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button
              className="icon-btn"
              aria-label="搜索股票代码"
              disabled={searching}
              onClick={search}
            >
              <Search size={16} />
            </button>
            <button
              className="icon-btn"
              aria-label="添加股票代码"
              onClick={() => void add().catch((e) => notify(e.message))}
            >
              <Plus size={18} />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((r, i) => (
                <button
                  key={r.symbol + i}
                  onClick={() =>
                    void add(r.symbol).catch((e) => notify(e.message))
                  }
                >
                  <b>{r.symbol}</b>
                  <small>{instrumentName(r.symbol, r.name)}</small>
                  <Plus size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="watch-items">
            {orderedWatchlist.map((s, i) => {
              const q = quotes[s],
                name =
                  instrumentName(s, journal.instruments.find((x) => x.symbol === s)?.name);
              return (
                <SortableWatchItem key={s} symbol={s} active={symbol===s} onMove={(from,to)=>void reorder(from,to).catch(e=>notify(e.message))}>
                  <button className="watch-symbol" onClick={() => setSymbol(s)}>
                    <div>
                      <b>{s}</b>
                      <small>{name}</small>
                    </div>
                    <div className="watch-price">
                      <b className={q ? tone(q.change) : "muted"}>{q ? money(q.price, false) : "—"}</b>
                      <small
                        className={
                          q ? tone(q.change) : "muted"
                        }
                      >
                        {q ? percent(q.percent) : "暂无报价"}
                      </small>
                    </div>
                  </button>
                  <div className="watch-actions">
                    <span>
                      {journal.instruments.find((x) => x.symbol === s)?.type ||
                        "股票"}
                    </span>
                    <button
                      className="icon-btn"
                      disabled={i === 0}
                      aria-label={`上移 ${s}`}
                      onClick={() =>
                        void move(s, -1).catch((e) => notify(e.message))
                      }
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      disabled={i === journal.watchlist.length - 1}
                      aria-label={`下移 ${s}`}
                      onClick={() =>
                        void move(s, 1).catch((e) => notify(e.message))
                      }
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`移除 ${s}`}
                      onClick={() => {
                        if (confirm(`从自选移除 ${s}？不会删除成交记录。`))
                          void onSave({
                            ...journal,
                            watchlist: journal.watchlist.filter((x) => x !== s),
                          }).catch((e) => notify(e.message));
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {q && (
                    <small className="quote-time">
                      {displayTime(q.time)} ET
                    </small>
                  )}
                </SortableWatchItem>
              );
            })}
          </div>
          <p className="watch-note">
            {provider
              ? "报价时效受行情订阅权限影响"
              : "未配置行情服务，可直接添加代码并导入历史行情。"}
          </p>
        </aside>
        <div className="stock-main">
          <section className="card stock-chart-card">
            <div className="stock-heading">
              <div>
                <h2>
                  {symbol} <span>{instrumentName(symbol, instrument?.name)}</span>
                </h2>
                <div className="stock-price">
                  {quote ? (
                    <>
                      {money(quote.price, false)}
                      <small
                        className={
                          tone(quote.change)
                        }
                      >
                        {money(quote.change)} ({percent(quote.percent)})
                      </small>
                    </>
                  ) : (
                    <span className="muted">暂无可用实时报价</span>
                  )}
                </div>
                <small className="muted">
                  {quote
                    ? `${displayTime(quote.time)} ET · ${quote.source}`
                    : "配置行情代理后可更新报价，或导入历史 OHLCV。"}
                </small>
              </div>
              <span className="badge">{instrument?.type || "股票"}</span>
            </div>
            <div className="chart-controls">
              <div className="segmented compact">
                {["15min", "1day"].map((it) => (
                  <button
                    key={it}
                    className={interval === it ? "active" : ""}
                    onClick={() => { setInterval(it); setStart(et().minus({days:6}).toISODate()!); setEnd(et().toISODate()!); }}
                  >
                    {it === "1day" ? "日线" : it.replace("min", " 分")}
                  </button>
                ))}
              </div>
              <div className="date-controls small">
                <input
                  aria-label="行情开始日期"
                  type="date"
                  value={start}
                  max={end}
                  onChange={(e) => {
                    if (e.target.value) setStart(e.target.value);
                  }}
                />
                <span>—</span>
                <input
                  aria-label="行情结束日期"
                  type="date"
                  min={start}
                  value={end}
                  onChange={(e) => {
                    if (e.target.value) setEnd(e.target.value);
                  }}
                />
              </div>
              <button
                className="btn secondary compact"
                disabled={busy}
                onClick={() => { historyCache.current.delete(`${symbol}|${interval}|${start}|${end}`); void fetchHistory(); }}
              >
                <RefreshCw size={14} className={busy ? "spin" : ""} />
                {busy ? "加载中" : "刷新行情"}
              </button>
            </div>
            {error && (
              <div className="error stock-error" role="alert">
                {error}
              </div>
            )}
            {chartData ? (
              <>
                <div
                  className={`data-source ${chartData.demo ? "demo-source" : ""}`}
                >
                  <Info size={14} />
                  {chartData.source} · {chartData.bars.length} 根 K 线
                  {chartData.demo && <strong>DEMO</strong>}
                </div>
                <PriceChart
                  data={chartData}
                  executions={es}
                  trades={ledger.trades}
                  focusId={focusId}
                  theme={journal.settings.theme}
                  onSelect={markerClick}
                />
                <div className="marker-legend">
                  <span>
                    <i className="marker-badge buy">B</i>实际买入价
                  </span>
                  <span>
                    <i className="marker-badge sell">S</i>实际卖出价
                  </span>
                  <span>
                    <i className="legend-line blue" />
                    盈利连线
                  </span>
                  <span>
                    <i className="legend-line yellow" />
                    亏损连线
                  </span>
                  <small>蜡烛：青绿涨 / 紫红跌 · 与盈亏配色独立</small>
                </div>
                <details className="fifo-explainer">
                  <summary>分批买卖的连线如何匹配？</summary>
                  <p>
                    按 FIFO
                    先进先出：每笔卖出先匹配最早尚未卖完的买入批次。一个买入点可连向多个卖出点，一次卖出也可连接多个买入点。剩余未平仓部分暂时没有卖出连线。
                  </p>
                  <p>
                    每条线的净盈亏 = 匹配数量 ×（实际卖价 − 实际买价）−
                    分摊买入费 −
                    分摊卖出费。蓝色为盈利，黄色为亏损，灰色为零盈亏。连线不是股价轨迹或交易建议；数量与费用明细见交易详情。
                  </p>
                </details>
              </>
            ) : (
              <div className="no-chart">
                <Empty
                  title={busy ? "正在获取真实历史行情…" : "此区间暂无历史行情"}
                >
                  <p>没有价格数据时，不绘制或推测 K 线。</p>
                  <div className="inline center">
                    <button
                      className="btn primary"
                      onClick={() => upload.current?.click()}
                    >
                      <Upload size={16} />
                      导入 OHLCV CSV
                    </button>
                    <button className="btn secondary" onClick={onSettings}>
                      配置行情服务
                    </button>
                  </div>
                </Empty>
              </div>
            )}
            <div className="chart-bottom">
              <span>
                {focusId ? "已定位关联交易 · " : ""}拖动平移 · 滚轮 / 双指缩放 ·
                点击 B / S 查看笔记
              </span>
              <button
                className="text-btn"
                onClick={() => upload.current?.click()}
              >
                <Upload size={14} />
                导入行情
              </button>
              <button
                className="text-btn"
                onClick={() =>
                  download(
                    "ohlcv-template.csv",
                    "time,open,high,low,close,volume,source\n2026-10-26T14:00:00Z,100,102,99,101,15000,demo\n",
                    "text/csv",
                  )
                }
              >
                CSV 格式模板
              </button>
              <input
                hidden
                type="file"
                ref={upload}
                accept=".csv,text/csv"
                onChange={(e) => void importCSV(e.target.files?.[0])}
              />
            </div>
          </section>
          <section className="card chart-executions">
            <div className="card-header">
              <div>
                <h2>
                  区间内实际成交 <span className="count">{es.length}</span>
                </h2>
                <p>
                  标记来自实际成交；缺失行情处保留成交点，不补造 K 线。
                </p>
              </div>
            </div>
            {es.length ? (
              <div className="execution-list">
                {es.map((e) => (
                  <button
                    key={e.id}
                    className={focusId === e.id ? "highlighted" : ""}
                    onClick={() => onExecution(e)}
                  >
                    <span className={`side-label ${e.side}`}>
                      {e.side === "buy" ? "买入" : "卖出"}
                    </span>
                    <b>{e.symbol}</b>
                    <span>
                      {money(e.price, false)} × {e.quantity}
                    </span>
                    <span className="muted">
                      {dayKey(e.time)} {displayTime(e.time).split(" ")[1]} ET
                    </span>
                    <span className="execution-note">{e.note || "无笔记"}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted padded">此日期范围内没有成交记录。</p>
            )}
          </section>
          <p className="footnote">
            历史分钟数据范围受供应商套餐限制。跨除权日比较请使用未复权数据；本
            MVP 暂不支持拆股等公司行动。
          </p>
          <a
            className="attribution"
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
          >
            Charts powered by TradingView Lightweight Charts™{" "}
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
      {selectedMarkers.length > 1 && (
        <Modal
          title="重合位置的全部成交"
          onClose={() => setSelectedMarkers([])}
        >
          <div className="form-body execution-list">
            {selectedMarkers.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  setSelectedMarkers([]);
                  onExecution(e);
                }}
              >
                <b>
                  {e.side === "buy" ? "买入" : "卖出"} {e.symbol}
                </b>
                <span>
                  ${e.price} × {e.quantity} · {displayTime(e.time)} ET
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {importing && (
        <Modal title="行情导入预览" onClose={() => setImporting(null)}>
          <div className="form-body">
            <p>
              <b>{importing.symbol}</b> · {importing.interval} ·{" "}
              {importing.bars.length} 根 K 线
            </p>
            <p className="muted">
              {new Date(importing.bars[0].time * 1000).toISOString()} →{" "}
              {new Date(importing.bars.at(-1)!.time * 1000).toISOString()}
            </p>
            <div className="subtle-note">
              用户导入数据未经供应商核验。将替换此股票、此周期的本地缓存。CSV
              模板仅为格式示例，不代表真实行情。
            </div>
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await onSave({
                    ...journal,
                    bars: [
                      ...journal.bars.filter(
                        (b) =>
                          b.symbol !== importing.symbol ||
                          b.interval !== importing.interval,
                      ),
                      importing,
                    ],
                  });
                  setProviderData(null);
                  setStart(
                    importing.interval === "1day"
                      ? new Date(importing.bars[0].time * 1000)
                          .toISOString()
                          .slice(0, 10)
                      : dayKey(
                          new Date(importing.bars[0].time * 1000).toISOString(),
                        ),
                  );
                  setEnd(
                    importing.interval === "1day"
                      ? new Date(importing.bars.at(-1)!.time * 1000)
                          .toISOString()
                          .slice(0, 10)
                      : dayKey(
                          new Date(
                            importing.bars.at(-1)!.time * 1000,
                          ).toISOString(),
                        ),
                  );
                  setImporting(null);
                  notify("历史行情已导入");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              确认导入
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
