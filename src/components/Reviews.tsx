import { useMemo, useState } from "react";
import {
  NotebookPen,
  Copy,
  Download,
  Search,
  ArrowUpRight,
} from "lucide-react";
import type { Journal, Execution } from "../domain/model";
import { D, money } from "../domain/ledger";
import { dayKey, displayTime } from "../domain/time";
import {
  reviewEntries,
  filterReviewEntries,
  entryTags,
  entryHasNotes,
  entrySymbol,
  entryTime,
  type ReviewFilters,
} from "../domain/reviewEntries";
import { download, summaryText } from "../data/transfer";
import { Pnl, Empty, Modal } from "./common";
export function Reviews({
  journal,
  onOpen,
  onOpenExecution,
  onChart,
  notify,
}: {
  journal: Journal;
  onOpen: (id: string) => void;
  onOpenExecution: (e: Execution) => void;
  onChart: (symbol: string, id: string) => void;
  notify: (s: string) => void;
}) {
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [symbol, setSymbol] = useState(""),
    [outcome, setOutcome] = useState<ReviewFilters["outcome"]>("all"),
    [status, setStatus] = useState<ReviewFilters["status"]>("all"),
    [tag, setTag] = useState(""),
    [onlyNotes, setOnlyNotes] = useState(false),
    [preview, setPreview] = useState(false);
  const all = useMemo(() => reviewEntries(journal), [journal]),
    tags = [...new Set(all.flatMap((e) => entryTags(journal, e)))];
  const entries = filterReviewEntries(journal, all, {
    start,
    end,
    symbol,
    outcome,
    status,
    tag,
    onlyNotes,
  });
  const closed = entries.flatMap((e) => (e.kind === "closed" ? [e.trade] : [])),
    open = entries.flatMap((e) => (e.kind === "open" ? [e.lot] : []));
  const text = summaryText(journal, closed, open);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制笔记汇总");
    } catch {
      notify("浏览器禁止自动复制，请在汇总预览中选中文本复制");
      setPreview(true);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            交易复盘
          </h1>
        </div>
        <button className="btn primary" onClick={() => setPreview(true)}>
          <NotebookPen size={17} />
          汇总笔记
        </button>
      </div>
      <div className="review-overview">
        <div>
          <b>{all.filter((e) => e.kind === "closed").length}</b>
          <span>已平仓明细</span>
        </div>
        <div>
          <b>{all.filter((e) => e.kind === "open").length}</b>
          <span>未平仓批次</span>
        </div>
        <div>
          <b>{all.filter((e) => entryHasNotes(journal, e)).length}</b>
          <span>有笔记</span>
        </div>
      </div>
      <section className="card review-filters">
        <div className="filter-bar">
          <Search size={16} />
          <input
            aria-label="复盘股票筛选"
            value={symbol}
            placeholder="搜索股票代码"
            onChange={(e) => setSymbol(e.target.value)}
          />
          <select
            aria-label="复盘持仓状态"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ReviewFilters["status"])
            }
          >
            <option value="all">全部状态</option>
            <option value="open">未平仓买入</option>
            <option value="closed">已平仓明细</option>
          </select>
          <select
            aria-label="复盘盈亏筛选"
            value={outcome}
            onChange={(e) =>
              setOutcome(e.target.value as ReviewFilters["outcome"])
            }
          >
            <option value="all">全部盈亏</option>
            <option value="profit">盈利交易</option>
            <option value="loss">亏损交易</option>
          </select>
          <select
            aria-label="策略标签筛选"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          >
            <option value="">全部策略</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={onlyNotes}
              onChange={(e) => setOnlyNotes(e.target.checked)}
            />
            仅有笔记
          </label>
        </div>
        <div className="filter-bar dates">
          <span className="muted">记录日期</span>
          <input
            aria-label="复盘开始日期"
            type="date"
            value={start}
            max={end || undefined}
            onChange={(e) => setStart(e.target.value)}
          />
          <span>—</span>
          <input
            aria-label="复盘结束日期"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
          <span className="right muted">
            {entries.length} 条记录 · 已平仓 {closed.length} / 未平仓{" "}
            {open.length}
          </span>
        </div>

      </section>
      <div className="review-grid">
        {entries.map((entry) => {
          const t = entry.kind === "closed" ? entry.trade : null,
            lot = entry.kind === "open" ? entry.lot : null;
          const symbol = entrySymbol(entry),
            buys = t ? t.buys : [lot!.buy],
            id = t ? t.id : lot!.buy.id;
          const buyNotes = buys.filter((b) => b.note),
            sellNote = t?.sell.note,
            review = t ? journal.reviews[t.id]?.note : undefined;
          const hasData = buyNotes.length > 0 || !!sellNote || !!review;
          return (
            <article
              className={`card review-card ${lot ? "open-review-card" : ""}`}
              key={`${entry.kind}:${id}`}
              data-review-status={entry.kind}
            >
              <div className="review-card-head">
                <div className="symbol-cell">
                  <span className="ticker-icon">{symbol[0]}</span>
                  <div>
                    <h2>
                      {symbol} {lot && <span className="badge">未平仓</span>}
                    </h2>
                    <small>
                      {dayKey(entryTime(entry))} ·{" "}
                      {journal.instruments.find((i) => i.symbol === symbol)
                        ?.name || symbol}
                    </small>
                  </div>
                </div>
                {t ? (
                  <Pnl value={t.pnl} capital={journal.settings.capital} />
                ) : (
                  <span className="pending-pnl">
                    <b>—</b>
                    <small>未平仓 · 不计收益</small>
                  </span>
                )}
              </div>
              <div className="review-trade">
                <div>
                  <span className="side-label buy">买入</span>
                  <b>{money(t ? t.avgBuy : lot!.buy.price, false)}</b>
                  <small>
                    {buys.length === 1
                      ? `${dayKey(buys[0].time)} ${displayTime(buys[0].time).split(" ")[1]} ET`
                      : `${buys.length} 个 FIFO 买入批次`}
                  </small>
                </div>
                <span className="muted">→</span>
                <div>
                  <span className="side-label sell">卖出</span>
                  <b>{t ? money(t.sell.price, false) : "—"}</b>
                  {t && (
                    <small>
                      {dayKey(t.sell.time)}{" "}
                      {displayTime(t.sell.time).split(" ")[1]} ET
                    </small>
                  )}
                </div>
              </div>
              {t && t.matches.length > 1 && (
                <div className="review-buy-batches">
                  <small>本次平仓的买入匹配</small>
                  {t.matches.map((m) => (
                    <div key={m.id}>
                      <span>
                        {dayKey(m.buy.time)}{" "}
                        {displayTime(m.buy.time).split(" ")[1]} ET
                      </span>
                      <b>
                        {money(m.buy.price, false)} × {m.quantity} 股
                      </b>
                    </div>
                  ))}
                </div>
              )}
              <div className="review-meta">
                {t ? (
                  <>
                    <span>{t.quantity} 股已平仓</span>
                    <span>分摊费用 {money(t.fees, false)}</span>
                  </>
                ) : (
                  <>
                    <span>
                      剩余 {lot!.quantity} 股 / 原买入 {lot!.buy.quantity} 股
                    </span>
                    {D(lot!.remainingFee).gt(0) && (
                      <span>待分摊费用 {money(lot!.remainingFee, false)}</span>
                    )}
                  </>
                )}
              </div>
              {hasData && (
                <div className="note-excerpt">
                  {buyNotes.length > 0 && (
                    <>
                      <span>买入判断</span>
                      {buyNotes.map((b) => (
                        <p key={b.id}>
                          {buyNotes.length > 1
                            ? `${displayTime(b.time)} ET：`
                            : ""}
                          {b.note}
                        </p>
                      ))}
                    </>
                  )}
                  {sellNote && (
                    <>
                      <span>卖出判断</span>
                      <p>{sellNote}</p>
                    </>
                  )}
                  {review && (
                    <>
                      <span>交易复盘</span>
                      <p>{review}</p>
                    </>
                  )}
                </div>
              )}
              <div className="review-card-foot">
                <div className="tags">
                  {entryTags(journal, entry).map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <button
                  className="text-btn"
                  onClick={() => (t ? onOpen(t.id) : onOpenExecution(lot!.buy))}
                >
                  查看 / 编辑 <ArrowUpRight size={15} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`查看 ${symbol} 交易点位`}
                  title="查看交易点位"
                  onClick={() => onChart(symbol, id)}
                >
                  <Search size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!entries.length && (
<Empty title="暂无符合条件的记录"/>
      )}
      {preview && (
        <Modal
          title={`笔记汇总 · ${entries.length} 条记录`}
          onClose={() => setPreview(false)}
          wide
        >
          <div className="form-body">

            <div className="inline">
              <button className="btn primary" onClick={copy}>
                <Copy size={16} />
                复制全部
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  download("trade-review.md", text, "text/markdown")
                }
              >
                <Download size={16} />
                导出 Markdown
              </button>
            </div>
            <textarea
              className="summary-text"
              readOnly
              rows={20}
              value={text}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
