import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ArrowDownUp,
  Filter,
  NotebookPen,
  ChartColumn,
  CalendarDays,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import type { Journal, ClosedTrade, Execution } from "../domain/model";
import {
  calculate,
  daily,
  D,
  sum,
  money,
  percent,
  pct,
  tone,
  hasNotes,
} from "../domain/ledger";
import {
  et,
  nowDay,
  dayKey,
  isSession,
  ZONE,
  displayTime,
} from "../domain/time";
import { Pnl, Empty, Direction } from "./common";
export type Range = { start: string; end: string };
export function TradeList({
  journal,
  trades,
  onOpen,
  onChart,
}: {
  journal: Journal;
  trades: ClosedTrade[];
  onOpen: (id: string) => void;
  onChart: (symbol: string, id: string) => void;
}) {
  return trades.length ? (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>股票 / 平仓</th>
              <th>买入 → 卖出均价</th>
              <th>平仓数量</th>
              <th>已实现净盈亏</th>
              <th>本金收益率</th>
              <th>交易收益率</th>
              <th>笔记</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr
                key={t.id}
                onClick={() => onOpen(t.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(t.id);
                }}
              >
                <td>
                  <div className="symbol-cell">
                    <span className="ticker-icon">{t.symbol.slice(0, 1)}</span>
                    <div>
                      <b>{t.symbol}</b>
                      <small>{displayTime(t.sell.time)} ET</small>
                    </div>
                  </div>
                </td>
                <td>
                  <b>{money(t.avgBuy, false)}</b>
                  <span className="muted"> → </span>
                  <b>{money(t.sell.price, false)}</b>
                  <small className="trade-buy-time">
                    买 {displayTime(t.buys[0].time)} ET
                    {t.buys.length > 1 ? ` 等 ${t.buys.length} 批` : ""}
                  </small>
                </td>
                <td>{t.quantity}</td>
                <td>
                  <Pnl value={t.pnl} />
                </td>
                <td className={tone(t.pnl)}>
                  {percent(pct(t.pnl, journal.settings.capital))}
                </td>
                <td className={tone(t.pnl)}>{percent(t.returnPct)}</td>
                <td>
                  <span
                    className={`note-state ${hasNotes(journal, t) ? "recorded" : ""}`}
                  >
                    <NotebookPen size={14} />
                    {hasNotes(journal, t) ? "已记录" : "待记录"}
                  </span>
                </td>
                <td>
                  <button
                    aria-label={`查看 ${t.symbol} 走势图`}
                    className="icon-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChart(t.symbol, t.id);
                    }}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="trade-mobile">
        {trades.map((t) => (
          <button
            className="trade-card"
            key={t.id}
            onClick={() => onOpen(t.id)}
          >
            <div className="inline">
              <span className="ticker-icon">{t.symbol[0]}</span>
              <div>
                <b>{t.symbol}</b>
                <small>{displayTime(t.sell.time)} ET</small>
              </div>
              <Pnl value={t.pnl} capital={journal.settings.capital} />
            </div>
            <div className="trade-card-bottom">
              <span>
                {t.quantity} 股 · {money(t.avgBuy, false)} →{" "}
                {money(t.sell.price, false)}
              </span>
              <NotebookPen size={14} />
            </div>
            <small className="trade-buy-time">
              买入 {dayKey(t.buys[0].time)}{" "}
              {displayTime(t.buys[0].time).split(" ")[1]} ET
              {t.buys.length > 1 ? ` 等 ${t.buys.length} 批` : ""}
            </small>
          </button>
        ))}
      </div>
    </>
  ) : (
    <Empty title="这段时间还没有已平仓交易">
      买入后，只有卖出的部分才会计入表现。
    </Empty>
  );
}
function DailyChart({
  days,
  start,
  end,
  capital,
  target,
  extra,
  onSelect,
}: {
  days: ReturnType<typeof daily>;
  start: string;
  end: string;
  capital: string;
  target: string;
  extra: string[];
  onSelect: (date: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const dates: string[] = [];
  let dt = DateTime.fromISO(start, { zone: ZONE }),
    limit = 0;
  while (dt.toISODate()! <= end && limit++ < 730) {
    const date = dt.toISODate()!;
    if (isSession(date, extra) || days[date]) dates.push(date);
    dt = dt.plus({ days: 1 });
  }
  const values = dates.map((d) => Number(days[d]?.pnl || 0)),
    goal = D(capital).mul(target).div(100).toNumber(),
    max = Math.max(goal * 1.5, 30, ...values),
    min = Math.min(-30, ...values),
    height = 225,
    w = 850,
    left = 55,
    right = 16,
    top = 20,
    bottom = 35,
    plotH = height - top - bottom;
  const y = (v: number) => top + ((max - v) / (max - min)) * plotH,
    step = (w - left - right) / Math.max(1, dates.length),
    barW = Math.max(1, Math.min(24, step * 0.52));
  const selected = (hover && days[hover]) || { pnl: "0", count: 0 };
  return (
    <div className="daily-chart">
      <div className="chart-legend">
        <span>
          <i className="legend-dot blue" />
          已实现净盈亏
        </span>
        <span>
          <i className="legend-line" />
          每日目标 {money(goal)}
        </span>
        {hover && (
          <b className={tone(selected.pnl)}>
            {hover} · {money(selected.pnl)} /{" "}
            {percent(pct(selected.pnl, capital))} · {selected.count} 笔平仓
          </b>
        )}
      </div>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        role="img"
        aria-label="每日已实现盈亏柱状图"
      >
        {[min, 0, max].map((v, i) => (
          <g key={i}>
            <line
              x1={left}
              x2={w - right}
              y1={y(v)}
              y2={y(v)}
              className={v === 0 ? "zero-line" : "grid-line"}
            />
            <text
              x={left - 10}
              y={y(v) + 4}
              textAnchor="end"
              className="axis-text"
            >
              {v === 0 ? "0" : Math.round(v)}
            </text>
          </g>
        ))}
        {dates.map((date, i) => {
          const v = values[i],
            x = left + step * (i + 0.5);
          return (
            <g
              key={date}
              className="chart-bar-group"
              onMouseEnter={() => setHover(date)}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                setHover(date);
                onSelect(date);
              }}
              role="button"
              tabIndex={0}
              aria-label={`${date} ${money(v)} 点击查看交易`}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setHover(date);
                  onSelect(date);
                }
              }}
            >
              <rect
                x={x - step / 2}
                y={top}
                width={step}
                height={plotH}
                fill={hover === date ? "var(--hover)" : "transparent"}
              />
              {isSession(date, extra) && (
                <line
                  x1={x - step / 2}
                  x2={x + step / 2}
                  y1={y(goal)}
                  y2={y(goal)}
                  className="target-line"
                />
              )}
              <rect
                x={x - barW / 2}
                y={Math.min(y(0), y(v))}
                width={barW}
                height={Math.max(v === 0 ? 2 : 3, Math.abs(y(v) - y(0)))}
                rx={3}
                fill={v > 0 ? "#3288DB" : v < 0 ? "#E2AD2F" : "var(--border)"}
              />
              {(dates.length < 10 || i % Math.ceil(dates.length / 9) === 0) && (
                <text
                  x={x}
                  y={height - 9}
                  textAnchor="middle"
                  className="axis-text"
                >
                  {date.slice(5).replace("-", "/")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {limit >= 730 && (
        <p className="chart-limit">
          图表最多显示前 730
          个自然日；缩小范围可查看后续日期。区间汇总使用完整范围。
        </p>
      )}
      {!dates.length && <p className="muted">此区间没有交易日</p>}
    </div>
  );
}
export function Dashboard({
  journal,
  range,
  setRange,
  onOpen,
  onChart,
  onExecution,
}: {
  journal: Journal;
  range: Range;
  setRange: (r: Range) => void;
  onOpen: (id: string) => void;
  onChart: (symbol: string, id: string) => void;
  onExecution: (e: Execution) => void;
}) {
  const ledger = useMemo(
      () => calculate(journal.executions),
      [journal.executions],
    ),
    days = useMemo(() => daily(ledger.trades), [ledger.trades]);
  const today = nowDay(),
    week = et().startOf("week").toISODate()!,
    month = et().startOf("month").toISODate()!;
  const period = (start: string, end: string = today) =>
      sum(
        ledger.trades
          .filter(
            (t) => dayKey(t.sell.time) >= start && dayKey(t.sell.time) <= end,
          )
          .map((t) => t.pnl),
      ).toString(),
    total = sum(ledger.trades.map((t) => t.pnl)).toString(),
    todayPnl = days[today]?.pnl || "0",
    goal = D(journal.settings.capital)
      .mul(journal.settings.dailyTarget)
      .div(100),
    diff = goal.minus(todayPnl),
    session = isSession(today, journal.settings.extraClosedDays),
    progress = goal.eq(0) ? 0 : D(todayPnl).div(goal).mul(100).toNumber();
  const [calendar, setCalendar] = useState(et().startOf("month")),
    [selectedDate, setSelectedDate] = useState(""),
    [symbol, setSymbol] = useState(""),
    [outcome, setOutcome] = useState("all"),
    [sort, setSort] = useState("newest");
  const filtered = ledger.trades
    .filter((t) => {
      const date = dayKey(t.sell.time);
      return (
        (selectedDate
          ? date === selectedDate
          : date >= range.start && date <= range.end) &&
        t.symbol.includes(symbol.toUpperCase()) &&
        (outcome === "all" ||
          (outcome === "profit"
            ? D(t.pnl).gt(0)
            : outcome === "loss"
              ? D(t.pnl).lt(0)
              : D(t.pnl).eq(0)))
      );
    })
    .sort((a, b) =>
      sort === "pnl"
        ? D(b.pnl).cmp(a.pnl)
        : sort === "symbol"
          ? a.symbol.localeCompare(b.symbol)
          : sort === "oldest"
            ? Date.parse(a.sell.time) - Date.parse(b.sell.time)
            : Date.parse(b.sell.time) - Date.parse(a.sell.time),
    );
  const calendarStart = calendar.startOf("week"),
    calendarCells = Array.from(
      {
        length:
          Math.ceil((calendar.weekday - 1 + calendar.daysInMonth!) / 7) * 7,
      },
      (_, i) => calendarStart.plus({ days: i }),
    );
  const currentMonthTrades = ledger.trades.filter((t) =>
      dayKey(t.sell.time).startsWith(calendar.toFormat("yyyy-MM")),
    ),
    monthPnl = sum(currentMonthTrades.map((t) => t.pnl));
  const inRange = ledger.trades.filter(
      (t) =>
        dayKey(t.sell.time) >= range.start && dayKey(t.sell.time) <= range.end,
    ),
    winning = inRange.filter((t) => D(t.pnl).gt(0)).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            交易表现<span className="heading-dot">.</span>
          </h1>
          
        </div>

      </div>
      <div className="metrics">
        <article className="card today-card">
          <div className="metric-label">
            今日已实现净盈亏{" "}
            <span className="badge">{et().toFormat("MM.dd")} ET</span>
          </div>
          <Pnl value={todayPnl} large />
          <div className={`return-chip ${tone(todayPnl)}`}>
            <Direction value={todayPnl} />
            {percent(pct(todayPnl, journal.settings.capital))}
            <span>本金收益率</span>
          </div>
          <div className="metric-foot">
            已完成 {days[today]?.count || 0} 笔平仓 <span>未平仓不计入</span>
          </div>
        </article>
        <article className="card target-card">
          <div className="metric-label">
            每日目标参考{" "}
            <span className="badge">{session ? "交易日" : "休市日"}</span>
          </div>
          <div className="target-number">
            {session ? percent(journal.settings.dailyTarget) : "今日休市"}
            <small>{session ? money(goal, false) : "不设常规目标"}</small>
          </div>
          <div className="progress-track">
            <div
              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
            />
          </div>
          <div className="target-caption">
            {session ? (
              <>
                <span>
                  {diff.gte(0) ? "距离目标" : "超出目标"}{" "}
                  <b>{money(diff.abs(), false)}</b>
                </span>
                <span className={tone(todayPnl)}>{Math.round(progress)}%</span>
              </>
            ) : (
              <span>交易目标只作比较，不是交易指令</span>
            )}
          </div>
        </article>
        <article className="card stacked-metrics">
          <div>
            <span className="metric-label">本周已实现盈亏</span>
            <Pnl value={period(week)} capital={journal.settings.capital} />
          </div>
          <div>
            <span className="metric-label">本月已实现盈亏</span>
            <Pnl value={period(month)} capital={journal.settings.capital} />
          </div>
        </article>
        <article className="card cumulative">
          <div className="metric-label">
            累计已实现净盈亏 · 全部历史
            <ArrowUpRight size={17} />
          </div>
          <Pnl value={total} large />
          <span className={`small-return ${tone(total)}`}>
            {percent(pct(total, journal.settings.capital))}
          </span>
          <div className="metric-foot">
            固定本金 <b>{money(journal.settings.capital, false)}</b>
          </div>
        </article>
      </div>
      <div className="overview-grid">
        <section className="card chart-card">
          <div className="card-header">
            <div>
              <h2>
                <ChartColumn size={17} />
                每日盈亏
              </h2>
              <p>只关注已落袋的结果</p>
            </div>
            <div className="mini-tabs">
              {[
                ["7D", 7],
                ["1M", 30],
                ["3M", 90],
              ].map(([label, n]) => (
                <button
                  key={label}
                  onClick={() => {
                    setRange({
                      start: et()
                        .minus({ days: Number(n) - 1 })
                        .toISODate()!,
                      end: today,
                    });
                    setSelectedDate("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        <div className="date-controls dashboard-range">
          <CalendarDays size={16} />
          <input
            aria-label="统计开始日期"
            type="date"
            value={range.start}
            max={range.end}
            onChange={(e) => {
              if (e.target.value) setRange({ ...range, start: e.target.value });
            }}
          />
          <span>—</span>
          <input
            aria-label="统计结束日期"
            type="date"
            min={range.start}
            value={range.end}
            onChange={(e) => {
              if (e.target.value) setRange({ ...range, end: e.target.value });
            }}
          />
        </div>
          <p className="muted small">日期仅筛选每日盈亏图和交易明细；累计收益始终包含全部历史成交。</p>
          <DailyChart
            days={days}
            start={range.start}
            end={range.end}
            capital={journal.settings.capital}
            target={journal.settings.dailyTarget}
            extra={journal.settings.extraClosedDays}
            onSelect={setSelectedDate}
          />
          <div className="chart-summary">
            <span>
              区间净盈亏{" "}
              <b className={tone(sum(inRange.map((t) => t.pnl)))}>
                {money(sum(inRange.map((t) => t.pnl)))}
              </b>
            </span>
            <span>
              平仓 <b>{inRange.length}</b> 笔
            </span>
            <span>
              盈利占比{" "}
              <b>
                {inRange.length
                  ? Math.round((winning / inRange.length) * 100)
                  : 0}
                %
              </b>
            </span>
          </div>
        </section>
        <section className="card calendar-card">
          <div className="card-header">
            <h2>
              <CalendarDays size={17} />
              盈亏日历
            </h2>
            <div className="calendar-nav">
              <button
                className="icon-btn"
                aria-label="上个月"
                onClick={() => setCalendar(calendar.minus({ months: 1 }))}
              >
                <ChevronLeft size={16} />
              </button>
              <span>{calendar.toFormat("yyyy 年 M 月")}</span>
              <button
                className="icon-btn"
                aria-label="下个月"
                onClick={() => setCalendar(calendar.plus({ months: 1 }))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <span className="weekday" key={d}>
                {d}
              </span>
            ))}
            {calendarCells.map((d) => {
              const date = d.toISODate()!,
                pnl = days[date]?.pnl,
                activeMonth = d.month === calendar.month;
              return (
                <button
                  key={date}
                  className={`calendar-day ${activeMonth ? "" : "outside"} ${pnl ? tone(pnl) : ""} ${date === today ? "today" : ""} ${selectedDate === date ? "selected" : ""}`}
                  title={`${date} ${money(pnl || 0)}${isSession(date, journal.settings.extraClosedDays) ? "" : " · 休市日"}`}
                  onClick={() =>
                    setSelectedDate(selectedDate === date ? "" : date)
                  }
                >
                  <span>{d.day}</span>
                  <small>
                    {pnl
                      ? money(pnl)
                      : isSession(date, journal.settings.extraClosedDays)
                        ? "—"
                        : "休"}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="calendar-foot">
            <span>
              本月合计 <b className={tone(monthPnl)}>{money(monthPnl)}</b>
            </span>
            <span className="muted">{currentMonthTrades.length} 笔平仓</span>
          </div>
        </section>
      </div>
      <section className="card transactions">
        <div className="card-header">
          <div>
            <h2>
              已平仓交易 <span className="count">{filtered.length}</span>
            </h2>
            <p>
              {selectedDate
                ? `${selectedDate} 的平仓成交`
                : "每笔卖出单独展示，多批买入按 FIFO 匹配"}
            </p>
          </div>
          {selectedDate && (
            <button className="text-btn" onClick={() => setSelectedDate("")}>
              <RotateCcw size={14} />
              清除日期选择
            </button>
          )}
        </div>
        <div className="filter-bar">
          <Filter size={16} />
          <input
            aria-label="筛选股票代码"
            placeholder="筛选股票代码"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          />
          <select
            aria-label="盈亏筛选"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            <option value="all">全部盈亏</option>
            <option value="profit">盈利交易</option>
            <option value="loss">亏损交易</option>
            <option value="zero">零盈亏</option>
          </select>
          <ArrowDownUp size={15} />
          <select
            aria-label="交易排序"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">最新平仓优先</option>
            <option value="oldest">最早平仓优先</option>
            <option value="pnl">净盈亏从高到低</option>
            <option value="symbol">股票代码 A–Z</option>
          </select>
        </div>
        <TradeList
          journal={journal}
          trades={filtered}
          onOpen={onOpen}
          onChart={onChart}
        />
      </section>
      <section className="card executions-panel">
        <details>
          <summary>
            原始成交与当前持仓{" "}
            <span className="muted">
              {journal.executions.length} 条成交 · {ledger.positions.length}{" "}
              只持仓
            </span>
          </summary>
          <div className="positions">
            {ledger.positions.length ? (
              ledger.positions.map((p) => (
                <span key={p.symbol}>
                  <b>{p.symbol}</b> {p.quantity} 股 · 未平仓成本{" "}
                  {money(p.cost, false)} · 待分摊费用{" "}
                  {money(p.remainingFee, false)}
                </span>
              ))
            ) : (
              <span className="muted">当前没有未平仓持仓</span>
            )}
          </div>
          <div className="execution-list">
            {[...journal.executions]
              .sort(
                (a, b) =>
                  Date.parse(b.time) - Date.parse(a.time) || b.seq - a.seq,
              )
              .map((e) => (
                <button key={e.id} onClick={() => onExecution(e)}>
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
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
        </details>
      </section>
      <p className="footnote">
        USD · 美东时间（自动处理夏令时） · 固定本金{" "}
        {money(journal.settings.capital, false)} · FIFO · 仅统计已实现净盈亏
      </p>
    </>
  );
}
