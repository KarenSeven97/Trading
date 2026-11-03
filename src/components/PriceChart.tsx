import { executionAxisTime, executionTimeline } from "../market/executionTimeline";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type AutoscaleInfo,
} from "lightweight-charts";
import type { BarSet, Execution, ClosedTrade } from "../domain/model";
import { dayKey, displayTime } from "../domain/time";
import { D, tone } from "../domain/ledger";
export function PriceChart({
  data,
  executions,
  trades,
  focusId,
  theme,
  onSelect,
}: {
  data: BarSet;
  executions: Execution[];
  trades: ClosedTrade[];
  focusId?: string;
  theme: "dark" | "light";
  onSelect: (es: Execution[]) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    [, setTick] = useState(0),
    [legend, setLegend] = useState(""),
    [ready, setReady] = useState(false);
  const es = useMemo(
    () => executions.filter((e) => e.symbol === data.symbol),
    [executions, data.symbol],
  );
  const timeline = useMemo(()=>executionTimeline(data,es),[data,es]);
  const timeIndices = useMemo(()=>new Map(timeline.map((p,i)=>[p.time,i])),[timeline]);
  const dark = theme === "dark",
    step = data.interval === "1day" ? 86400 : parseInt(data.interval) * 60;
  useEffect(() => {
    if (!host.current) return;
    setReady(false);
    const c = createChart(host.current, {
      autoSize: true,
      height: 410,
      layout: {
        background: {
          type: ColorType.Solid,
          color: dark ? "#151b26" : "#ffffff",
        },
        textColor: dark ? "#7e8b9e" : "#65748b",
        fontFamily: "Inter, system-ui, sans-serif",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: dark ? "#1e2633" : "#edf1f6" },
        horzLines: { color: dark ? "#1e2633" : "#edf1f6" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        timeVisible: data.interval !== "1day",
        secondsVisible: false,
        borderColor: dark ? "#283142" : "#e1e6ee",
        rightOffset: 7,
        tickMarkFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return data.interval === "1day"
            ? d.toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                timeZone: "UTC",
              })
            : d.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: "America/New_York",
              });
        },
      },
      rightPriceScale: {
        borderColor: dark ? "#283142" : "#e1e6ee",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      localization: {
        timeFormatter: (time: number) =>
          data.interval === "1day"
            ? new Date(time * 1000).toISOString().slice(0, 10)
            : new Date(time * 1000).toLocaleString("zh-CN", {
                timeZone: "America/New_York",
                hour12: false,
              }) + " ET",
      },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#66aaa0",
      downColor: "#bf8399",
      borderUpColor: "#66aaa0",
      borderDownColor: "#bf8399",
      wickUpColor: "#66aaa0",
      wickDownColor: "#bf8399",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const result = base();
        const visiblePrices = es.map((e) => Number(e.price));
        if (!result || !result.priceRange) {
          if(!visiblePrices.length)return result;
          const low=Math.min(...visiblePrices),high=Math.max(...visiblePrices);
          return {priceRange:{minValue:low*0.995,maxValue:high*1.005}};
        }
        if (visiblePrices.length) {
          result.priceRange.minValue = Math.min(
            result.priceRange.minValue,
            ...visiblePrices,
          );
          result.priceRange.maxValue = Math.max(
            result.priceRange.maxValue,
            ...visiblePrices,
          );
        }
        return result;
      },
    });
    s.setData(timeline.map((b) => ({ ...b, time: b.time as UTCTimestamp })));
    // Actual execution prices provide an axis even if every OHLC bar is missing.
    // This transparent series draws no invented market-price path.
    const anchor = c.addSeries(LineSeries, {
      color:"transparent", lineVisible:false, lastValueVisible:false,
      priceLineVisible:false, crosshairMarkerVisible:false,
      autoscaleInfoProvider:()=>es.length ? {priceRange:{minValue:Math.min(...es.map(e=>Number(e.price)))*0.995,maxValue:Math.max(...es.map(e=>Number(e.price)))*1.005}} : null,
    });
    const anchorValues=new Map(es.map(e=>[executionAxisTime(data,e),Number(e.price)]));
    anchor.setData([...anchorValues].sort(([a],[b])=>a-b).map(([time,value])=>({time:time as UTCTimestamp,value})));
    c.timeScale().fitContent();
    chart.current = c;
    series.current = s;
    let renderFrame=0;
    const update = () => { cancelAnimationFrame(renderFrame); renderFrame=requestAnimationFrame(()=>setTick(t=>t+1)); };
    c.timeScale().subscribeVisibleLogicalRangeChange(update);
    c.subscribeCrosshairMove((param) => {
      const d = param.seriesData.get(s) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (d && "open" in d)
        setLegend(
          `O ${d.open.toFixed(2)}   H ${d.high.toFixed(2)}   L ${d.low.toFixed(2)}   C ${d.close.toFixed(2)}`,
        );
      else setLegend("");
    });
    const observer = new ResizeObserver(update);
    observer.observe(host.current);
    const node = host.current;
    node.addEventListener("wheel", update);
    node.addEventListener("pointermove", update);
    node.addEventListener("touchmove", update);
    const frame = requestAnimationFrame(() => {
      setReady(true);
      update();
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(renderFrame);
      observer.disconnect();
      node.removeEventListener("wheel", update);
      node.removeEventListener("pointermove", update);
      node.removeEventListener("touchmove", update);
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, [data, dark, es, step, timeline]);
  useEffect(() => {
    if (!ready || !focusId || !chart.current) return;
    const e = es.find((e) => e.id === focusId),
      t = trades.find(
        (t) => t.id === focusId || t.buys.some((b) => b.id === focusId),
      );
    if (!e && !t) return;
    const times = t
      ? [...t.buys, t.sell].map((e) => executionAxisTime(data,e))
      : [executionAxisTime(data,e!)];
    const min = Math.min(...times),
      max = Math.max(...times);
    const first = timeline.findIndex((b) => b.time >= min - step * 8),
      last = timeline.findIndex((b) => b.time >= max + step * 8);
    if (first >= 0)
      chart.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, first - 3),
        to: last < 0 ? timeline.length + 3 : last + 3,
      });
    setTick((n) => n + 1);
  }, [ready, focusId, data]);
  function point(e: Execution) {
    if (!chart.current || !series.current || !host.current) return null;
    const i = timeIndices.get(executionAxisTime(data,e));
    if(i === undefined)return null;
    const exact=chart.current.timeScale().logicalToCoordinate(i as any),
      y=series.current.priceToCoordinate(Number(e.price));
    if(exact === null || y === null)return null;
    const plotWidth=host.current.clientWidth-chart.current.priceScale("right").width();
    const plotHeight=host.current.clientHeight-chart.current.timeScale().height();
    if(exact<0||exact>plotWidth||y<0||y>plotHeight)return null;
    return { x: exact, y };
  }
  const points = ready
    ? es.map((e) => ({ e, p: point(e) })).filter((x) => x.p !== null)
    : [];
  const groups = new Map<string, typeof points>();
  for (const p of points) {
    const key = p.p!.x.toFixed(2) + ":" + p.p!.y.toFixed(2);
    groups.set(key, [...(groups.get(key) || []), p]);
  }
  return (
    <div className="chart-shell">
      <div className="ohlc-legend">
        {legend ||
          `${data.interval === "1day" ? "日线" : "分钟线"} · 美东 ET`}
      </div>
      <div ref={host} className="lw-chart" />
      <svg className="trade-lines" width="100%" height="410" aria-hidden="true">
        {ready &&
          trades
            .filter((t) => t.symbol === data.symbol)
            .flatMap((t) =>
              t.matches.map((m) => {
                const a = point(m.buy),
                  b = point(m.sell);
                return a && b ? (
                  <line
                    key={m.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={
                      D(m.pnl).gt(0)
                        ? "#3288DB"
                        : D(m.pnl).lt(0)
                          ? "#E2AD2F"
                          : "#8490A4"
                    }
                    strokeWidth={focusId === t.id ? 2 : 1}
                    strokeDasharray="4 4"
                    opacity={focusId && focusId !== t.id ? 0.3 : 0.8}
                  />
                ) : null;
              }),
            )}
      </svg>
      <div className="execution-markers">
        {[...groups].map(([key, ps]) => {
          const { e, p } = ps[0],
            focused = ps.some(
              ({ e }) =>
                e.id === focusId ||
                trades
                  .find((t) => t.id === focusId)
                  ?.buys.some((b) => b.id === e.id),
            );
          return (
            <button
              key={key}
              style={{ left: p!.x, top: p!.y }}
              className={`execution-marker ${e.side} ${focused ? "focused" : ""}`}
              onClick={() => onSelect(ps.map((p) => p.e))}
              aria-label={`${ps.length > 1 ? ps.length + " 笔成交，" : e.side === "buy" ? "买入" : "卖出"} ${e.symbol} $${e.price} ${displayTime(e.time)} ET`}
              title={ps
                .map(
                  ({ e }) =>
                    `${e.side === "buy" ? "买入" : "卖出"} $${e.price} × ${e.quantity} · ${displayTime(e.time)} ET`,
                )
                .join("\n")}
            >
              {ps.length > 1 ? ps.length : e.side === "buy" ? "B" : "S"}
            </button>
          );
        })}
      </div>
      <div className="chart-tools">
        <button
          onClick={() => {
            chart.current?.timeScale().fitContent();
            setTick((t) => t + 1);
          }}
        >
          适合窗口
        </button>
        <button
          onClick={() => {
            const s = chart.current?.timeScale();
            const r = s?.getVisibleLogicalRange();
            if (s && r) {
              const center = (r.from + r.to) / 2;
              s.setVisibleLogicalRange({
                from: center - (r.to - r.from) * 0.35,
                to: center + (r.to - r.from) * 0.35,
              });
            }
          }}
        >
          放大 +
        </button>
      </div>
    </div>
  );
}
