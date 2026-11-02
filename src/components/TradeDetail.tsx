import { useState } from "react";
import { ChartCandlestick, Edit3, Trash2, Check } from "lucide-react";
import type { Journal, Execution, ClosedTrade } from "../domain/model";
import { D, money, percent, pct, tradeTags } from "../domain/ledger";
import { displayTime, dayKey } from "../domain/time";
import { Modal, Field, Pnl } from "./common";
export function TradeDetail({
  journal,
  trade,
  execution,
  onClose,
  onSave,
  onEdit,
  onDelete,
  onChart,
  relatedTrades = [],
  onOpenTrade,
}: {
  journal: Journal;
  trade?: ClosedTrade;
  execution?: Execution;
  onClose: () => void;
  onSave: (j: Journal) => Promise<void>;
  onEdit: (e: Execution) => void;
  onDelete: (e: Execution) => void;
  onChart: (symbol: string, id: string) => void;
  relatedTrades?: ClosedTrade[];
  onOpenTrade: (id: string) => void;
}) {
  const e = execution || trade?.sell;
  const [note, setNote] = useState(
      trade ? journal.reviews[trade.id]?.note || "" : "",
    ),
    [tags, setTags] = useState(
      trade ? tradeTags(journal, trade).join("、") : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!e) return null;
  const es = trade ? [...trade.buys, trade.sell] : [e];
  async function save() {
    setBusy(true);
    try {
      await onSave({
        ...journal,
        reviews: {
          ...journal.reviews,
          [trade!.id]: {
            note,
            tags: tags
              .split(/[,，、]/)
              .map((t) => t.trim())
              .filter(Boolean),
          },
        },
      });
      setError("已保存复盘");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${e.symbol} · ${trade ? "交易详情与复盘" : "成交详情"}`}
      onClose={onClose}
      wide
    >
      <div className="form-body">
        <div className="detail-hero">
          <div>
            <span className="eyebrow">
              {trade ? "已实现净盈亏" : "未单独确认盈亏"}
            </span>
            <div>
              {trade ? (
                <Pnl
                  value={trade.pnl}
                  capital={journal.settings.capital}
                  large
                />
              ) : (
                <strong>{e.side === "buy" ? "买入成交" : "卖出成交"}</strong>
              )}
            </div>
          </div>
          <button
            className="btn secondary"
            onClick={() => onChart(e.symbol, e.id)}
          >
            <ChartCandlestick size={16} />
            查看点位
          </button>
        </div>
        {trade && (
          <div className="detail-stats">
            <div>
              <small>已平仓数量</small>
              <b>{trade.quantity} 股</b>
            </div>
            <div>
              <small>匹配买入均价</small>
              <b>{money(trade.avgBuy, false)}</b>
            </div>
            <div>
              <small>分摊交易费用</small>
              <b>{money(trade.fees, false)}</b>
            </div>
            <div>
              <small>交易自身收益率</small>
              <b className={D(trade.pnl).lt(0) ? "loss" : "profit"}>
                {percent(trade.returnPct)}
              </b>
            </div>
          </div>
        )}
        {es.map((x) => (
          <section className="execution-detail" key={x.id}>
            <div className="section-top">
              <div className="inline">
                <span className={`side-label ${x.side}`}>
                  {x.side === "buy" ? "买入" : "卖出"}
                </span>
                <strong>{x.symbol}</strong>
                <span className="muted">
                  {dayKey(x.time)} {displayTime(x.time).split(" ")[1]} ET
                </span>
              </div>
              <div className="inline">
                <button
                  className="icon-btn"
                  title="编辑这条成交"
                  aria-label={`编辑${x.side === "buy" ? "买入" : "卖出"}成交`}
                  onClick={() => onEdit(x)}
                >
                  <Edit3 size={15} />
                </button>
                <button
                  className="icon-btn"
                  title="删除这条成交"
                  aria-label={`删除${x.side === "buy" ? "买入" : "卖出"}成交`}
                  onClick={() => onDelete(x)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="execution-values">
              <b>
                {money(x.price, false)} <span className="muted">×</span>{" "}
                {x.quantity} 股
              </b>
              <span className="muted">成交费用 {money(x.fee, false)}</span>
            </div>
            <p className={x.note ? "" : "muted"}>
              {x.note || "尚未添加成交笔记"}
            </p>
            <small className="muted">
              数据来源：
              {x.source === "demo"
                ? "演示"
                : x.source === "csv"
                  ? "CSV 导入"
                  : "手动录入"}{" "}
              · UTC {x.time}
            </small>
          </section>
        ))}
        {!trade && relatedTrades.length > 0 && (
          <section>
            <h3>此买入批次关联的平仓与复盘</h3>
            <div className="execution-list">
              {relatedTrades.map((t) => (
                <button key={t.id} onClick={() => onOpenTrade(t.id)}>
                  <b>
                    {dayKey(t.sell.time)}{" "}
                    {displayTime(t.sell.time).split(" ")[1]} ET
                  </b>
                  <span>{t.quantity} 股</span>
                  <Pnl value={t.pnl} />
                  <span>
                    {journal.reviews[t.id]?.note || "查看 / 添加复盘"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {trade && (
          <>
            <div className="subtle-note">
              FIFO 将本笔卖出匹配到 {trade.matches.length}{" "}
              个买入批次。净盈亏已分摊买入和卖出费用，本金收益率{" "}
              {percent(pct(trade.pnl, journal.settings.capital))}。
            </div>
            <details className="fifo-detail">
              <summary>查看 FIFO 逐批匹配与费用</summary>
              <div className="fifo-match-list">
                {trade.matches.map((m) => (
                  <div key={m.id} className="fifo-match-row">
                    <div>
                      <b>
                        买入 {money(m.buy.price, false)} → 卖出{" "}
                        {money(m.sell.price, false)} × {m.quantity} 股
                      </b>
                      <small>
                        买 {dayKey(m.buy.time)}{" "}
                        {displayTime(m.buy.time).split(" ")[1]} ET → 卖{" "}
                        {dayKey(m.sell.time)}{" "}
                        {displayTime(m.sell.time).split(" ")[1]} ET
                      </small>
                      <small>
                        分摊买入费 {money(m.buyFee, false)} + 分摊卖出费{" "}
                        {money(m.sellFee, false)}
                      </small>
                    </div>
                    <Pnl value={m.pnl} />
                  </div>
                ))}
              </div>
            </details>
            <Field label="交易复盘">
              <textarea
                rows={5}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="为什么赚或亏？是否按计划执行？最大的错误和下次的改进是什么？"
              />
            </Field>
            <Field label="复盘标签">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="用顿号或逗号分隔"
              />
            </Field>
            {error && (
              <div
                role="status"
                className={error === "已保存复盘" ? "success" : "error"}
              >
                {error}
              </div>
            )}
            <footer className="form-footer">
              <span className="muted">复盘是为了改进过程</span>
              <button className="btn primary" disabled={busy} onClick={save}>
                <Check size={16} />
                {busy ? "保存中…" : "保存复盘"}
              </button>
            </footer>
          </>
        )}
      </div>
    </Modal>
  );
}
