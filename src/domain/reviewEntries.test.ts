import { describe, it, expect } from "vitest";
import { emptyJournal, type Execution, type Journal } from "./model";
import { calculate, daily, sum } from "./ledger";
import {
  reviewEntries,
  filterReviewEntries,
  type ReviewFilters,
} from "./reviewEntries";
import { summaryText, backup, parseBackup } from "../data/transfer";
import { beijingPreview, toUTC } from "./time";
const execution = (
  id: string,
  side: "buy" | "sell",
  quantity: string,
  price = "10",
  fee = "0",
  symbol = "AMD",
  time = "2026-10-26T14:00:00Z",
  seq = 0,
): Execution => ({
  id,
  symbol,
  side,
  quantity,
  price,
  fee,
  time,
  seq,
  note: "",
  tags: [],
  source: "manual",
  createdAt: time,
  updatedAt: time,
});
const filters: ReviewFilters = {
  start: "",
  end: "",
  symbol: "",
  outcome: "all",
  status: "all",
  tag: "",
  onlyNotes: false,
};
const journal = (executions: Execution[]): Journal => ({
  ...emptyJournal(),
  executions,
});
describe("未平仓复盘", () => {
  it("每个尚未平仓买入批次均可见，保留自己的笔记与标签", () => {
    const j = journal([
      { ...execution("b1", "buy", "10"), note: "第一笔判断", tags: ["突破"] },
      execution("b2", "buy", "20", "11"),
    ]);
    const es = reviewEntries(j);
    expect(es).toHaveLength(2);
    expect(es.every((e) => e.kind === "open")).toBe(true);
    expect(
      filterReviewEntries(j, es, { ...filters, tag: "突破", onlyNotes: true }),
    ).toHaveLength(1);
    expect(calculate(j.executions).trades).toHaveLength(0);
  });
  it("部分卖出同时展示平仓明细和剩余批次，收益不会重复计入", () => {
    const j = journal([
      execution("b", "buy", "100", "10", "1"),
      execution(
        "s",
        "sell",
        "40",
        "12",
        "0.40",
        "AMD",
        "2026-10-28T14:00:00Z",
        1,
      ),
    ]);
    const raw = JSON.stringify(j.executions);
    const entries = reviewEntries(j),
      l = calculate(j.executions);
    expect(entries.map((e) => e.kind).sort()).toEqual(["closed", "open"]);
    expect(l.openLots[0].quantity).toBe("60");
    expect(l.openLots[0].remainingFee).toBe("0.6");
    expect(l.trades[0].pnl).toBe("79.2");
    expect(daily(l.trades)["2026-10-28"].pnl).toBe("79.2");
    expect(JSON.stringify(j.executions)).toBe(raw);
  });
  it("FIFO 多批买入后只展示真正剩余的批次，不为已卖完批次创建待平仓项", () => {
    const j = journal([
      execution("first", "buy", "10", "100"),
      execution(
        "second",
        "buy",
        "10",
        "110",
        "0",
        "AMD",
        "2026-10-26T14:01:00Z",
      ),
      execution(
        "sell",
        "sell",
        "15",
        "120",
        "0",
        "AMD",
        "2026-10-26T15:00:00Z",
      ),
    ]);
    const l = calculate(j.executions);
    expect(l.openLots).toHaveLength(1);
    expect(l.openLots[0].buy.id).toBe("second");
    expect(l.openLots[0].quantity).toBe("5");
    expect(sum(l.trades.map((t) => t.pnl)).toString()).toBe("250");
  });
  it("日期按已平仓卖出日、未平仓买入日筛选；盈亏筛选排除待平仓项", () => {
    const j = journal([
        execution("b", "buy", "100"),
        execution(
          "s",
          "sell",
          "40",
          "12",
          "0",
          "AMD",
          "2026-10-28T14:00:00Z",
          1,
        ),
      ]),
      es = reviewEntries(j);
    expect(
      filterReviewEntries(j, es, {
        ...filters,
        start: "2026-10-26",
        end: "2026-10-26",
      }).map((e) => e.kind),
    ).toEqual(["open"]);
    expect(
      filterReviewEntries(j, es, { ...filters, status: "closed" }).map(
        (e) => e.kind,
      ),
    ).toEqual(["closed"]);
    expect(
      filterReviewEntries(j, es, { ...filters, outcome: "profit" }).map(
        (e) => e.kind,
      ),
    ).toEqual(["closed"]);
    expect(
      filterReviewEntries(j, es, {
        ...filters,
        status: "open",
        outcome: "profit",
      }),
    ).toHaveLength(0);
  });
  it("汇总与备份保留未平仓笔记，卖出和收益为横线，缺失笔记不生成空段落", () => {
    const j = journal([
        { ...execution("b", "buy", "10"), note: "还未卖出", tags: ["观察"] },
      ]),
      l = calculate(j.executions);
    const text = summaryText(j, l.trades, l.openLots);
    expect(text).toContain("- 卖出：—");
    expect(text).toContain("- 已实现净盈亏：—");
    expect(text).toContain("还未卖出");
    expect(text).not.toContain("### 卖出笔记");
    expect(text).not.toContain("### 交易复盘");
    expect(
      calculate(parseBackup(backup(j)).executions).openLots[0].buy.note,
    ).toBe("还未卖出");
  });
  it("完全平仓后不再生成未平仓卡片；每笔原始买入仍能在平仓记录找到", () => {
    const j = journal([
        execution("b", "buy", "10"),
        execution("s", "sell", "10", "12", "0", "AMD", "2026-10-26T15:00:00Z"),
      ]),
      entries = reviewEntries(j);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("closed");
    if (entries[0].kind === "closed")
      expect(entries[0].trade.buys[0].id).toBe("b");
  });
});
describe("输入时区说明", () => {
  it("夏令时纽约10点对应北京时间22点，冬令时对应23点", () => {
    expect(beijingPreview("2026-10-30T10:00")).toBe("2026-10-30 22:00:00");
    expect(beijingPreview("2026-12-01T10:00")).toBe("2026-12-01 23:00:00");
    expect(toUTC("2026-10-30T16:00")).toBe("2026-10-30T20:00:00.000Z");
    expect(beijingPreview("2026-10-30T16:00")).toBe("2026-10-31 04:00:00");
  });
  it("不为夏令时跳过或重复时间提供错误的北京时间", () => {
    expect(beijingPreview("2026-03-08T02:30")).toBeNull();
    expect(beijingPreview("2026-11-01T01:30")).toBeNull();
  });
});
