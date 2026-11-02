import type { BarSet, Execution } from "../domain/model";
import { dayKey } from "../domain/time";
/** Preserve actual execution seconds inside a minute bar. Never bridge missing bars. */
export function locateExecution(
  data: BarSet,
  e: Execution,
): { index: number; fraction: number } | null {
  if (data.symbol !== e.symbol) return null;
  if (data.interval === "1day") {
    const date = dayKey(e.time);
    const index = data.bars.findIndex(
      (b) => new Date(b.time * 1000).toISOString().slice(0, 10) === date,
    );
    return index < 0 ? null : { index, fraction: 0 };
  }
  const step = parseInt(data.interval) * 60;
  const t = Date.parse(e.time) / 1000;
  let lo = 0,
    hi = data.bars.length - 1,
    index = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (data.bars[mid].time <= t) {
      index = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (index < 0 || t >= data.bars[index].time + step) return null;
  return { index, fraction: (t - data.bars[index].time) / step };
}
