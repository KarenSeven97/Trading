import { DateTime } from "luxon";
import { emptyJournal, type Execution, type Journal } from "../domain/model";
import { isSession, ZONE } from "../domain/time";
export function demoJournal(): Journal {
  const j = emptyJournal("demo");
  let dt = DateTime.now().setZone(ZONE).startOf("day");
  const dates: string[] = [];
  while (dates.length < 15) {
    if (isSession(dt.toISODate()!)) dates.unshift(dt.toISODate()!);
    dt = dt.minus({ days: 1 });
  }
  const symbols = ["AMD", "NVDA", "SOXS", "QQQM"];
  const profits = [
    62, -45, 118, 80, -32, 150, 35, -65, 210, 95, -80, 130, 52, 175, 150,
  ];
  for (let i = 0; i < dates.length; i++) {
    const symbol = symbols[i % 4],
      price = [155, 184, 8.5, 260][i % 4],
      q = symbol === "SOXS" ? 100 : 20;
    const buy: Execution = {
      id: `demo-buy-${i}`,
      symbol,
      side: "buy",
      price: String(price),
      quantity: String(q),
      fee: "1",
      time: DateTime.fromISO(dates[i] + "T10:05:00", { zone: ZONE })
        .toUTC()
        .toISO()!,
      note:
        i % 3 === 0
          ? "等待回踩后入场，预先写下退出条件。"
          : "观察成交量变化，小仓位验证判断。",
      tags: [["突破", "反弹", "止损"][i % 3]],
      source: "demo",
      seq: i * 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const sell: Execution = {
      ...buy,
      id: `demo-sell-${i}`,
      side: "sell",
      price: String(price + (profits[i] + 2) / q),
      time: DateTime.fromISO(dates[i] + "T11:35:00", { zone: ZONE })
        .toUTC()
        .toISO()!,
      note:
        profits[i] > 0
          ? "分时走势转弱，执行预定止盈。"
          : "判断失效，按计划止损。",
      seq: i * 2 + 1,
    };
    j.executions.push(buy, sell);
    j.reviews[sell.id] = {
      note:
        i % 2
          ? "遵守了仓位限制。下次把入场条件写得更具体。"
          : "这次结果不能证明策略有效，继续记录相同条件下的表现。",
      tags: buy.tags,
    };
  }
  return j;
}
