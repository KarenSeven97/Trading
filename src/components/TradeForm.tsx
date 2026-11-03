import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { uid, type Execution, type Journal } from "../domain/model";
import { calculate, D } from "../domain/ledger";
import { beijingInput, beijingToUTC, easternPreview } from "../domain/time";
import { Field, Modal } from "./common";
type Row = {
  side: "buy" | "sell";
  price: string;
  quantity: string;
  fee: string;
  local: string;
  note: string;
};
const newRow = (side: "buy" | "sell", fee: string): Row => ({
  side,
  price: "",
  quantity: "",
  fee,
  local: beijingInput(),
  note: "",
});
export function TradeForm({
  journal,
  editing,
  initialSymbol,
  onSave,
  onClose,
}: {
  journal: Journal;
  editing?: Execution;
  initialSymbol?: string;
  onSave: (j: Journal) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"quick" | "full" | "batch">("quick"),
    [symbol, setSymbol] = useState(editing?.symbol || initialSymbol || ""),
    [tags, setTags] = useState(editing?.tags.join("、") || ""),
    [review, setReview] = useState(""),
    [rows, setRows] = useState<Row[]>(
      editing
        ? [
            {
              side: editing.side,
              price: editing.price,
              quantity: editing.quantity,
              fee: editing.fee,
              local: beijingInput(editing.time),
              note: editing.note,
            },
          ]
        : [newRow("buy", journal.settings.defaultFee)],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  function changeMode(m: typeof mode) {
    setMode(m);
    if (m === "quick") setRows([rows[0]]);
    else if (rows.length < 2)
      setRows([
        rows[0],
        {
          ...newRow("sell", journal.settings.defaultFee),
          quantity: rows[0].quantity,
        },
      ]);
  }
  function patch(i: number, key: keyof Row, value: string) {
    setRows((rs) =>
      rs.map((r, k) =>
        k === i
          ? { ...r, [key]: value }
          : mode === "full" && key === "quantity" && i === 0
            ? { ...r, quantity: value }
            : r,
      ),
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const stamp = new Date().toISOString(),
        seq = Math.max(-1, ...journal.executions.map((e) => e.seq)) + 1;
      const added: Execution[] = rows.map((r, i) => ({
        id: editing?.id || uid(),
        symbol: symbol.trim().toUpperCase(),
        side: r.side,
        price: r.price.trim(),
        quantity: r.quantity.trim(),
        fee: r.fee.trim() || "0",
        time:
          editing && r.local === beijingInput(editing.time)
            ? editing.time
            : beijingToUTC(r.local),
        note: r.note,
        tags: tags
          .split(/[,，、]/)
          .map((t) => t.trim())
          .filter(Boolean),
        source: editing?.source || "manual",
        createdAt: editing?.createdAt || stamp,
        updatedAt: stamp,
        seq: editing?.seq ?? seq + i,
      }));
      if (mode === "full" && D(added[1].quantity).gt(added[0].quantity))
        throw new Error(
          "完整补录的卖出数量不能超过本次买入，请使用分批成交模式",
        );
      const next = {
        ...journal,
        executions: [
          ...journal.executions.filter((x) => x.id !== editing?.id),
          ...added,
        ],
        reviews: { ...journal.reviews },
      };
      calculate(next.executions);
      if (review && mode !== "quick") {
        const sell = added.filter((e) => e.side === "sell").at(-1);
        if (sell) next.reviews[sell.id] = { note: review, tags: added[0].tags };
      }
      await onSave(next);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={editing ? "编辑成交记录" : "新增交易"} onClose={onClose} wide>
      <form onSubmit={save} className="form-body">
        {!editing && (
          <div className="segmented">
            <button
              type="button"
              className={mode === "quick" ? "active" : ""}
              onClick={() => changeMode("quick")}
            >
              快速记录
            </button>
            <button
              type="button"
              className={mode === "full" ? "active" : ""}
              onClick={() => changeMode("full")}
            >
              完整补录
            </button>
            <button
              type="button"
              className={mode === "batch" ? "active" : ""}
              onClick={() => changeMode("batch")}
            >
              分批成交
            </button>
          </div>
        )}
        <div className="form-grid">
          <Field label="股票代码 *">
            <input
              autoFocus
              required
              list="instrument-options"
              placeholder="例如 AMD"
              maxLength={16}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
            <datalist id="instrument-options">
              {journal.instruments.map((i) => (
                <option key={i.symbol} value={i.symbol}>
                  {i.name}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="策略标签" hint="用顿号或逗号分隔，可自定义">
            <input
              placeholder="突破、反弹、止损…"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </Field>
        </div>
        {rows.map((r, i) => (
          <section key={i} className="execution-form">
            <div className="section-top">
              <h3>{rows.length > 1 ? `成交 ${i + 1}` : "成交信息"}</h3>
              {mode === "batch" && rows.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="删除此成交行"
                  onClick={() => setRows(rows.filter((_, k) => k !== i))}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <div className="side-control">
              <button
                type="button"
                className={r.side === "buy" ? "selected buy" : ""}
                onClick={() => patch(i, "side", "buy")}
              >
                ↗ 买入
              </button>
              <button
                type="button"
                className={r.side === "sell" ? "selected sell" : ""}
                onClick={() => patch(i, "side", "sell")}
              >
                ↘ 卖出
              </button>
            </div>
            <div className="form-grid three">
              <Field label="成交价格 USD *">
                <input
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  value={r.price}
                  onChange={(e) => patch(i, "price", e.target.value)}
                />
              </Field>
              <Field label="成交数量 *">
                <input
                  required
                  inputMode="decimal"
                  placeholder="股数"
                  value={r.quantity}
                  onChange={(e) => patch(i, "quantity", e.target.value)}
                />
              </Field>
              <Field label="交易费用 USD">
                <input
                  inputMode="decimal"
                  value={r.fee}
                  onChange={(e) => patch(i, "fee", e.target.value)}
                />
              </Field>
            </div>
            <Field
              label="成交日期与时间 · 北京时间 *"
              hint={
                easternPreview(r.local)
                  ? `对应美东时间：${easternPreview(r.local)}`
                  : "北京时间"
              }
            >
              <input
                required
                type="datetime-local"
                step="1"
                value={r.local}
                onChange={(e) => patch(i, "local", e.target.value)}
              />
            </Field>
            <Field label={r.side === "buy" ? "买入笔记" : "卖出笔记"}>
              <textarea
                rows={2}
                placeholder={
                  r.side === "buy"
                    ? "选填"
                    : "选填"
                }
                value={r.note}
                onChange={(e) => patch(i, "note", e.target.value)}
              />
            </Field>
          </section>
        ))}
        {mode === "batch" && (
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              setRows([...rows, newRow("sell", journal.settings.defaultFee)])
            }
          >
            <Plus size={16} />
            添加一条成交
          </button>
        )}
        {mode !== "quick" && (
          <Field
            label="完整交易复盘"
            hint="关联最后一笔卖出"
          >
            <textarea
              rows={3}
              placeholder="是否按计划执行？下次可以改进什么？"
              value={review}
              onChange={(e) => setReview(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
            {error.includes("超过") && (
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setMode("batch");
                  setRows([
                    newRow("buy", journal.settings.defaultFee),
                    ...rows,
                  ]);
                  setError("请补录早于卖出的买入成交，并再次保存。");
                }}
              >
                补录买入记录
              </button>
            )}
          </div>
        )}
        <footer className="form-footer">

          <button type="button" className="btn secondary" onClick={onClose}>
            取消
          </button>
          <button disabled={busy} className="btn primary">
            {busy ? "保存中…" : "保存交易"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
