import { describe, it, expect } from "vitest";
import { calculate, D, pct, daily, tone, validateJournal } from "./ledger";
import { emptyJournal, type Execution } from "./model";
import { dayKey, toUTC, isSession } from "./time";
import {
  backup,
  parseBackup,
  executionCSV,
  parseExecutions,
} from "../data/transfer";
import { parseOHLCV } from "../market/provider";
import "fake-indexeddb/auto";
import { persist, load } from "../data/storage";
let n = 0;
const ex = (
  side: "buy" | "sell",
  price: string,
  quantity: string,
  fee = "0",
  time = "2026-10-26T14:00:00Z",
): Execution => ({
  id: "e" + ++n,
  symbol: "AMD",
  side,
  price,
  quantity,
  fee,
  time,
  note: "判断",
  tags: ["反弹"],
  source: "manual",
  createdAt: time,
  updatedAt: time,
  seq: n,
});
describe("账本验收", () => {
  it("1 固定本金 150=1.50%", () => expect(pct("150", "10000")).toBe("1.5"));
  it("2 亏损颜色与目标距离", () => {
    expect(pct("-80", "10000")).toBe("-0.8");
    expect(D(100).minus(-80).toString()).toBe("180");
    expect(tone("-80")).toBe("loss");
  });
  it("3 未平仓不计入", () => {
    const l = calculate([ex("buy", "10", "100")]);
    expect(l.trades).toHaveLength(0);
    expect(l.positions[0].quantity).toBe("100");
  });
  it("4 部分平仓与费用分摊", () => {
    const l = calculate(
      [ex("buy", "10", "100", "1"), ex("sell", "12", "40", ".40")].map((e) => ({
        ...e,
        fee: e.fee === ".40" ? "0.40" : e.fee,
      })),
    );
    expect(l.trades[0].pnl).toBe("79.2");
    expect(l.positions[0].remainingFee).toBe("0.6");
  });
  it("5 FIFO 250 与剩余成本", () => {
    const l = calculate([
      ex("buy", "100", "10"),
      ex("buy", "110", "10"),
      ex("sell", "120", "15"),
    ]);
    expect(l.trades[0].pnl).toBe("250");
    expect(l.positions[0].cost).toBe("550");
  });
  it("6 跨日按卖出美东日期确认", () => {
    const l = calculate([
      ex("buy", "10", "10"),
      ex("sell", "12", "10", "0", "2026-10-29T00:15:00Z"),
    ]);
    expect(Object.keys(daily(l.trades))).toEqual(["2026-10-28"]);
  });
  it("7 同日两轮独立", () => {
    const l = calculate([
      ex("buy", "10", "10"),
      ex("sell", "12", "10"),
      ex("buy", "11", "20"),
      ex("sell", "12", "20"),
    ]);
    expect(l.trades).toHaveLength(2);
    expect(new Set(l.matches.map((m) => m.id)).size).toBe(2);
  });
  it("8 修改触发重算，删除受依赖保护", () => {
    const es = [ex("buy", "10", "10"), ex("sell", "12", "10")];
    expect(calculate(es).trades[0].pnl).toBe("20");
    es[1].price = "13";
    expect(calculate(es).trades[0].pnl).toBe("30");
    expect(() => calculate(es.slice(1))).toThrow("超过");
  });
  it("9 笔记和复盘备份完整", () => {
    const j = emptyJournal();
    j.executions = [ex("buy", "10", "10"), ex("sell", "12", "10")];
    j.reviews[j.executions[1].id] = { note: "复盘", tags: ["突破"] };
    const b = parseBackup(backup(j));
    expect(b.executions[0].note).toBe("判断");
    expect(b.reviews[j.executions[1].id].note).toBe("复盘");
  });
  it("10 IndexedDB 重载、CSV重复识别、备份恢复", async () => {
    const j = emptyJournal();
    j.executions = [ex("buy", "10", "10"), ex("sell", "12", "10")];
    await persist(j);
    const loaded = await load("live");
    expect(calculate(loaded.executions).trades[0].pnl).toBe("20");
    expect(
      parseExecutions(executionCSV(loaded), loaded.executions).every(
        (x) => x.duplicate,
      ),
    ).toBe(true);
    expect(parseBackup(backup(loaded)).executions).toEqual(loaded.executions);
  });
  it("11 OHLCV UTC 与实际成交时间，拒绝虚构", () => {
    const data = parseOHLCV(
      "time,open,high,low,close,volume\n2026-10-26T14:00:00Z,10,12,9,11,100",
      "AMD",
      "1min",
    );
    expect(data.demo).toBe(false);
    expect(data.bars[0].time).toBe(Date.parse("2026-10-26T14:00:00Z") / 1000);
    expect(() =>
      parseOHLCV(
        "time,open,high,low,close\n2026-10-26,10,9,11,12",
        "AMD",
        "1day",
      ),
    ).toThrow();
  });
  it("精确小数、买卖费用最终残差", () => {
    const es = [
      ex("buy", "0.1", "3", "1"),
      ex("sell", "0.2", "1", "0.1"),
      ex("sell", "0.2", "2", "0.2"),
    ];
    const l = calculate(es);
    expect(l.positions).toHaveLength(0);
    expect(D(l.trades[0].pnl).plus(l.trades[1].pnl).toFixed(12)).toBe(
      "-1.000000000000",
    );
  });
  it("超卖与编辑买入时间保护", () => {
    expect(() =>
      calculate([ex("sell", "10", "1"), ex("buy", "10", "1")]),
    ).toThrow();
  });
  it("DST 与节假日", () => {
    expect(dayKey("2026-03-09T03:30:00Z")).toBe("2026-03-08");
    expect(toUTC("2026-07-01T10:00:00")).toBe("2026-07-01T14:00:00.000Z");
    expect(toUTC("2026-01-05T10:00:00")).toBe("2026-01-05T15:00:00.000Z");
    expect(() => toUTC("2026-03-08T02:30:00")).toThrow();
    expect(isSession("2026-04-03")).toBe(false);
    expect(isSession("2026-11-26")).toBe(false);
    expect(isSession("2026-10-31")).toBe(false);
    expect(isSession("2026-10-30")).toBe(true);
    expect(isSession("2026-10-30", ["2026-10-30"])).toBe(false);
  });
  it("备份结构校验拒绝损坏数据", () => {
    const j = emptyJournal();
    j.settings.capital = "0";
    expect(() => validateJournal(j)).toThrow();
  });
  it("并发版本保护避免静默覆盖", async () => {
    const j = await load("live");
    await persist(j);
    await expect(persist(j)).rejects.toThrow("其他标签页");
  });
});

describe("导入与数据隔离", () => {
  it("演示成交 CSV 不能混入正式账本", () => {
    const j = emptyJournal("demo");
    j.executions = [{ ...ex("buy", "10", "1"), source: "demo" }];
    expect(() => parseExecutions(executionCSV(j), [], "live")).toThrow("演示");
    expect(parseExecutions(executionCSV(j), [], "demo")).toHaveLength(1);
  });
  it("高精度成交不能因浮点归一化被误判为重复", () => {
    const a = ex("buy", "100.000000000001", "1"),
      b = { ...a, id: "different", price: "100.000000000002" };
    const j = emptyJournal();
    j.executions = [b];
    expect(parseExecutions(executionCSV(j), [a])[0].duplicate).toBe(false);
  });
  it("合并导入后超卖时整本校验拒绝", () => {
    const j = emptyJournal();
    j.executions = [ex("sell", "10", "2")];
    const rows = parseExecutions(executionCSV(j), []);
    expect(() => calculate(rows.map((r) => r.e))).toThrow("超过");
  });
  it("重复时间行情与非法价格被拒绝", () => {
    expect(() =>
      parseOHLCV(
        "time,open,high,low,close\n1793023200,10,12,9,11\n1793023200,10,12,9,11",
        "AMD",
        "1min",
      ),
    ).toThrow("重复");
    expect(() =>
      parseOHLCV(
        "time,open,high,low,close\n1793023200,10,9,11,12",
        "AMD",
        "1min",
      ),
    ).toThrow("无效");
  });
});
