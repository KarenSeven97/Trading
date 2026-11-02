import Papa from "papaparse";
import { uid, type Execution, type Journal } from "../domain/model";
import {
  calculate,
  validateExecution,
  validateJournal,
  money,
  percent,
  pct,
  tradeTags,
  D,
} from "../domain/ledger";
import { displayTime, dayKey } from "../domain/time";
export const fingerprint = (e: Execution) =>
  [
    e.symbol,
    e.side,
    new Date(e.time).toISOString(),
    ...[e.price, e.quantity, e.fee].map((x) => D(x).toString()),
  ].join("|");
export function parseExecutions(
  csv: string,
  existing: Execution[],
  mode: "live" | "demo" = "live",
) {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });
  if (result.errors.length)
    throw new Error("CSV 格式错误：" + result.errors[0].message);
  const seen = new Set(existing.map(fingerprint));
  const seenIds = new Set(existing.map((e) => e.id));
  const initialSeq = Math.max(-1, ...existing.map((e) => e.seq)) + 1;
  return result.data.map((r, i) => {
    if (mode === "live" && (r.ledgerMode === "demo" || r.source === "demo"))
      throw new Error("演示成交不能导入正式账本，请切换到演示账本");
    const stamp = new Date().toISOString();
    const e: Execution = {
      id: r.id || uid(),
      symbol: (r.symbol || "").trim().toUpperCase(),
      side: r.side as Execution["side"],
      time: r.time || "",
      price: r.price,
      quantity: r.quantity,
      fee: r.fee || "0",
      note: r.note || "",
      tags: (r.tags || "").split("|").filter(Boolean),
      source: "csv",
      seq: initialSeq + i,
      createdAt: r.createdAt || stamp,
      updatedAt: stamp,
    };
    validateExecution(e);
    e.time = new Date(e.time).toISOString();
    const duplicate = seenIds.has(e.id) || seen.has(fingerprint(e));
    seen.add(fingerprint(e));
    seenIds.add(e.id);
    return { e, duplicate, include: !duplicate };
  });
}
export function executionCSV(j: Journal) {
  return Papa.unparse(
    j.executions.map((e) => ({
      id: e.id,
      symbol: e.symbol,
      side: e.side,
      price: e.price,
      quantity: e.quantity,
      time: e.time,
      fee: e.fee,
      note: e.note,
      tags: e.tags.join("|"),
      createdAt: e.createdAt,
      source: e.source,
      ledgerMode: j.mode,
    })),
  );
}
export function backup(j: Journal) {
  return JSON.stringify(
    {
      format: "trade-journal",
      exportedAt: new Date().toISOString(),
      journal: j,
    },
    null,
    2,
  );
}
export function parseBackup(text: string) {
  const data = JSON.parse(text);
  if (data.format !== "trade-journal")
    throw new Error("不是 Trade Journal 完整备份");
  validateJournal(data.journal);
  data.journal.executions = data.journal.executions.map((e: Execution) => ({
    ...e,
    time: e.time.endsWith("Z") ? e.time : new Date(e.time).toISOString(),
  }));
  return data.journal as Journal;
}
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(
      new Blob([type === "text/csv" ? "\uFEFF" : "", text], { type }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function summaryText(
  j: Journal,
  trades: ReturnType<typeof calculate>["trades"],
  openLots: ReturnType<typeof calculate>["openLots"] = [],
) {
  const stamp = (time: string) =>
    `${dayKey(time)} ${displayTime(time).split(" ")[1]} ET`;
  const sections = trades.map((t) => ({
    time: t.sell.time,
    text:
      `## ${t.symbol} · 已平仓 · ${dayKey(t.sell.time)}\n\n- 开仓：${t.buys.map((b) => `${stamp(b.time)} / $${b.price} × ${b.quantity}`).join("；")}\n- 平仓：${stamp(t.sell.time)} / $${t.sell.price} × ${t.quantity}\n- 匹配买入均价：$${t.avgBuy}；分摊费用：${money(t.fees, false)}\n- 已实现净盈亏：${money(t.pnl)}；本金收益率：${percent(pct(t.pnl, j.settings.capital))}；交易收益率：${percent(t.returnPct)}\n` +
      (tradeTags(j, t).length
        ? `- 标签：${tradeTags(j, t).join("、")}\n`
        : "") +
      (t.buys.some((b) => b.note)
        ? `\n### 买入笔记\n${t.buys
            .filter((b) => b.note)
            .map((b) => `${stamp(b.time)}：${b.note}`)
            .join("\n")}\n`
        : "") +
      (t.sell.note ? `\n### 卖出笔记\n${t.sell.note}\n` : "") +
      (j.reviews[t.id]?.note
        ? `\n### 交易复盘\n${j.reviews[t.id].note}\n`
        : ""),
  }));
  sections.push(
    ...openLots.map((l) => ({
      time: l.buy.time,
      text:
        `## ${l.buy.symbol} · 未平仓买入 · ${dayKey(l.buy.time)}\n\n- 买入：${stamp(l.buy.time)} / $${l.buy.price} × ${l.buy.quantity}\n- 剩余未平仓：${l.quantity} 股\n- 卖出：—\n- 已实现净盈亏：—；本金收益率：—；交易收益率：—（本批次未平仓部分不计收益）\n` +
        (D(l.remainingFee).gt(0)
          ? `- 待分摊买入费用：${money(l.remainingFee, false)}\n`
          : "") +
        (l.buy.tags.length ? `- 标签：${l.buy.tags.join("、")}\n` : "") +
        (l.buy.note ? `\n### 买入笔记\n${l.buy.note}\n` : ""),
    })),
  );
  return (
    "# Trade Journal · 交易复盘\n\n" +
    `账本：${j.mode === "demo" ? "演示" : "正式"} · 时区：America/New_York · 固定本金：${money(j.settings.capital, false)}\n\n` +
    sections
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
      .map((x) => x.text)
      .join("\n---\n\n")
  );
}
