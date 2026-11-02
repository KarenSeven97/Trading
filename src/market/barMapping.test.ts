import { it, expect } from "vitest";
import { locateExecution } from "./barMapping";
import type { Execution, BarSet } from "../domain/model";
const base = Date.parse("2026-10-26T14:00:00Z") / 1000;
const bar = (time: number) => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 100,
});
const set: BarSet = {
  symbol: "AMD",
  interval: "5min",
  source: "test",
  demo: false,
  importedAt: "2026-10-26T14:00:00Z",
  bars: [bar(base), bar(base + 300), bar(base + 900)],
};
const e = (time: string): Execution => ({
  id: time,
  symbol: "AMD",
  side: "buy",
  price: "103.25",
  quantity: "1",
  fee: "0",
  time,
  note: "",
  tags: [],
  source: "manual",
  seq: 0,
  createdAt: time,
  updatedAt: time,
});
it("分钟线保留成交秒数，同根 K 线的多笔成交不合并", () => {
  expect(locateExecution(set, e("2026-10-26T14:01:00Z"))).toEqual({
    index: 0,
    fraction: 0.2,
  });
  expect(locateExecution(set, e("2026-10-26T14:04:30Z"))).toEqual({
    index: 0,
    fraction: 0.9,
  });
  expect(locateExecution(set, e("2026-10-26T14:05:00Z"))).toEqual({
    index: 1,
    fraction: 0,
  });
});
it("缺失历史 K 线时不贴到临近 K 线", () => {
  expect(locateExecution(set, e("2026-10-26T14:11:00Z"))).toBeNull();
  expect(locateExecution(set, e("2026-10-26T13:59:59Z"))).toBeNull();
});
it("日线按照美东交易日期匹配，不用 UTC 成交日", () => {
  const daily = {
    ...set,
    interval: "1day",
    bars: [bar(Date.parse("2026-10-26T00:00:00Z") / 1000)],
  };
  expect(locateExecution(daily, e("2026-10-27T00:15:00Z"))).toEqual({
    index: 0,
    fraction: 0,
  });
  expect(locateExecution(daily, e("2026-10-27T14:00:00Z"))).toBeNull();
});
