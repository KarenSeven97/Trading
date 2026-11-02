import { useState } from "react";
import type { Journal, Execution } from "../domain/model";
import { uid } from "../domain/model";
import { calculate, money, sum } from "../domain/ledger";
import { Modal, Pnl } from "./common";
import type { parseExecutions } from "../data/transfer";
export type ImportData =
  | { type: "csv"; rows: ReturnType<typeof parseExecutions> }
  | { type: "backup"; journal: Journal };
export function ImportPreview({
  data,
  journal,
  onClose,
  onSave,
  notify,
}: {
  data: ImportData;
  journal: Journal;
  onClose: () => void;
  onSave: (j: Journal) => Promise<void>;
  notify: (s: string) => void;
}) {
  const [rows, setRows] = useState(data.type === "csv" ? data.rows : []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  let candidate: Journal | undefined,
    validationError = "",
    stats: { count: number; pnl: string } | null = null;
  try {
    if (data.type === "backup") {
      if (data.journal.mode !== journal.mode)
        throw new Error(
          "备份账本类型不匹配，请先切换至" +
            (data.journal.mode === "demo" ? "演示账本" : "正式账本") +
            "再恢复",
        );
      candidate = { ...data.journal, revision: journal.revision };
    } else {
      const ids = new Set(journal.executions.map((e) => e.id));
      const added = rows
        .filter((r) => r.include)
        .map((r, i) => {
          const e = {
            ...r.e,
            seq: Math.max(-1, ...journal.executions.map((e) => e.seq)) + i + 1,
          };
          if (ids.has(e.id)) e.id = uid();
          ids.add(e.id);
          return e;
        });
      candidate = { ...journal, executions: [...journal.executions, ...added] };
    }
    const l = calculate(candidate.executions);
    stats = {
      count: l.trades.length,
      pnl: sum(l.trades.map((t) => t.pnl)).toString(),
    };
  } catch (e) {
    validationError = (e as Error).message;
  }
  async function apply() {
    if (!candidate || validationError) return;
    if (
      !confirm(
        data.type === "backup"
          ? (journal.mode === "live" ? "完整恢复会替换公开共享账本，影响所有访问者。请先备份。确认恢复？" : "完整恢复会替换当前演示账本，建议先备份。确认恢复？")
          : `确认导入 ${rows.filter((r) => r.include).length} 条成交？`,
      )
    )
      return;
    setBusy(true);
    try {
      await onSave(candidate);
      notify(
        data.type === "backup" ? "账本已完整恢复" : "成交已导入并重新计算",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={data.type === "csv" ? "成交导入预览" : "完整备份恢复预览"}
      onClose={onClose}
      wide
    >
      <div className="form-body">
        {data.type === "csv" ? (
          <>
            <p>
              {rows.length} 条成交 ·{" "}
              <b>{rows.filter((r) => r.duplicate).length} 条可能重复</b> · 已选{" "}
              {rows.filter((r) => r.include).length} 条
            </p>
            <div className="subtle-note">
              相同 ID
              或相同股票、方向、时间、价格、数量和费用会标记为可能重复，默认跳过。真实的同时间同价格成交可手动勾选，导入时生成独立
              ID。
            </div>
            <div className="import-rows">
              {rows.map((r, i) => (
                <label key={i} className={r.duplicate ? "duplicate" : ""}>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) =>
                      setRows(
                        rows.map((x, k) =>
                          k === i ? { ...x, include: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <b>{r.e.symbol}</b>
                  <span>
                    {r.e.side === "buy" ? "买入" : "卖出"} {r.e.quantity} ×{" "}
                    {money(r.e.price, false)}
                  </span>
                  <small>{r.e.time}</small>
                  {r.duplicate && <span className="badge">可能重复</span>}
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <p>
              备份类型：
              <b>{data.journal.mode === "demo" ? "演示账本" : "正式账本"}</b>
            </p>
            <p>
              {data.journal.executions.length} 条成交 ·{" "}
              {Object.keys(data.journal.reviews).length} 条完整复盘 ·{" "}
              {data.journal.watchlist.length} 只自选 ·{" "}
              {data.journal.bars.length} 组行情
            </p>
            <div className="subtle-note">
              将替换当前账本的成交、笔记、设置、自选和缓存。正式账本的恢复会同步给所有访问者；另一种账本不会受到影响。
            </div>
          </>
        )}
        {stats && (
          <div className="import-stats">
            导入后：{stats.count} 笔已平仓 · 净盈亏 <Pnl value={stats.pnl} />
          </div>
        )}
        {(validationError || error) && (
          <div className="error" role="alert">
            {validationError || error}
          </div>
        )}
        <footer className="form-footer">
          <button className="btn secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            disabled={
              busy ||
              !!validationError ||
              (data.type === "csv" && !rows.some((r) => r.include))
            }
            onClick={apply}
          >
            {busy
              ? "写入中…"
              : data.type === "backup"
                ? "确认恢复"
                : "确认导入"}
          </button>
        </footer>
      </div>
    </Modal>
  );
}
