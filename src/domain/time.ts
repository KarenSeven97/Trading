import { DateTime } from "luxon";
export const ZONE = "America/New_York";
export const et = (iso?: string) =>
  iso
    ? DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE)
    : DateTime.now().setZone(ZONE);
export const dayKey = (iso: string) => et(iso).toISODate()!;
export const nowDay = () => et().toISODate()!;
export function toUTC(local: string) {
  const dt = DateTime.fromISO(local, { zone: ZONE });
  if (
    !dt.isValid ||
    dt.toFormat("yyyy-MM-dd'T'HH:mm:ss") !==
      (local.length === 16 ? local + ":00" : local)
  )
    throw new Error("美东时间无效（可能处于夏令时跳过的时段）");
  if (dt.getPossibleOffsets().length > 1)
    throw new Error("此时间处于夏令时回拨的重复时段，请改用明确 UTC 时间导入");
  return dt.toUTC().toISO()!;
}
export const localInput = (iso?: string) =>
  et(iso).toFormat("yyyy-MM-dd'T'HH:mm:ss");
export const displayTime = (iso: string) => et(iso).toFormat("MM/dd HH:mm:ss");
export function beijingPreview(local: string) {
  try {
    return DateTime.fromISO(toUTC(local), { zone: "utc" })
      .setZone("Asia/Shanghai")
      .toFormat("yyyy-MM-dd HH:mm:ss");
  } catch {
    return null;
  }
}
function observed(dt: DateTime) {
  return dt.weekday === 6
    ? dt.minus({ days: 1 })
    : dt.weekday === 7
      ? dt.plus({ days: 1 })
      : dt;
}
function nth(y: number, m: number, weekday: number, n: number) {
  let d = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: ZONE });
  return d.plus({ days: ((weekday - d.weekday + 7) % 7) + (n - 1) * 7 });
}
function easter(y: number) {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.fromObject({ year: y, month, day }, { zone: ZONE });
}
export function isSession(date: string, extra: string[] = []) {
  const dt = DateTime.fromISO(date, { zone: ZONE });
  if (!dt.isValid || dt.weekday > 5 || extra.includes(date)) return false;
  const y = dt.year,
    fixed = (m: number, d: number) =>
      observed(
        DateTime.fromObject({ year: y, month: m, day: d }, { zone: ZONE }),
      );
  const days = [
    nth(y, 1, 1, 3),
    nth(y, 2, 1, 3),
    DateTime.fromObject({ year: y, month: 5, day: 31 }, { zone: ZONE }).startOf(
      "week",
    ),
    easter(y).minus({ days: 2 }),
    fixed(7, 4),
    nth(y, 9, 1, 1),
    nth(y, 11, 4, 4),
    fixed(12, 25),
  ];
  if (y >= 2022) days.push(fixed(6, 19));
  const ny = DateTime.fromObject({ year: y, month: 1, day: 1 }, { zone: ZONE });
  if (ny.weekday !== 6) days.push(observed(ny));
  return !days.some((d) => d.toISODate() === date);
}
