import { emptyJournal, type Journal, type Execution } from "../domain/model";
import { validateJournal } from "../domain/ledger";
import { fingerprint } from "./transfer";
export const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export function sharedDocument(j: Journal): Journal {
  return {
    ...j,
    revision: 0,
    mode: "live",
    bars: [],
    settings: { ...j.settings, theme: "dark", proxyUrl: "" },
  };
}
export function withDeviceSettings(shared: Journal, local: Journal): Journal {
  return {
    ...shared,
    revision: local.revision,
    bars: local.bars,
    settings: {
      ...shared.settings,
      theme: local.settings.theme,
      proxyUrl: local.settings.proxyUrl,
    },
  };
}
function choose<T>(
  base: T | undefined,
  local: T | undefined,
  remote: T | undefined,
  label: string,
): T | undefined {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  throw new Error(
    `同步冲突：${label} 已被不同设备修改；本机记录已保留，请备份后处理`,
  );
}
function mergeMap<T>(
  base: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>,
  label: string,
) {
  const out: Record<string, T> = {};
  for (const id of new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const value = choose(base[id], local[id], remote[id], `${label} ${id}`);
    if (value !== undefined) out[id] = value;
  }
  return out;
}
function recordMap<T>(xs: T[], id: (x: T) => string) {
  return Object.fromEntries(xs.map((x) => [id(x), x]));
}
function mergeWatchlist(base: string[], local: string[], remote: string[]) {
  if (same(local, base)) return remote;
  if (same(remote, base) || same(local, remote)) return local;
  const membership = mergeMap(
    Object.fromEntries(base.map((x) => [x, true])),
    Object.fromEntries(local.map((x) => [x, true])),
    Object.fromEntries(remote.map((x) => [x, true])),
    "自选",
  );
  return [...new Set([...remote, ...local])].filter((x) => membership[x]);
}
export function mergeShared(
  base: Journal,
  local: Journal,
  remote: Journal,
): Journal {
  const b = sharedDocument(base),
    l = sharedDocument(local),
    r = sharedDocument(remote);
  const executions = Object.values(
    mergeMap(
      recordMap(b.executions, (e) => e.id),
      recordMap(l.executions, (e) => e.id),
      recordMap(r.executions, (e) => e.id),
      "成交",
    ),
  );
  // Give independently added local fills deterministic sequence positions after remote fills at the same timestamp.
  const remoteIds = new Set(r.executions.map((e) => e.id));
  let seq = Math.max(-1, ...r.executions.map((e) => e.seq));
  for (const e of [...executions]
    .filter(
      (e) => !remoteIds.has(e.id) && !b.executions.some((x) => x.id === e.id),
    )
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.seq - b.seq)) {
    const index = executions.findIndex((x) => x.id === e.id);
    executions[index] = { ...e, seq: ++seq };
  }
  const result: Journal = {
    ...r,
    executions,
    reviews: mergeMap(b.reviews, l.reviews, r.reviews, "复盘笔记"),
    settings: mergeMap(
      b.settings as any,
      l.settings as any,
      r.settings as any,
      "设置",
    ) as any,
    instruments: Object.values(
      mergeMap(
        recordMap(b.instruments, (i) => i.symbol),
        recordMap(l.instruments, (i) => i.symbol),
        recordMap(r.instruments, (i) => i.symbol),
        "股票",
      ),
    ),
    watchlist: mergeWatchlist(b.watchlist, l.watchlist, r.watchlist),
  };
  validateJournal(result);
  return result;
}
export function mergeInitial(local: Journal, remote: Journal): Journal {
  const aliases = new Map<string, string>(),
    remoteByFingerprint = new Map(
      remote.executions.map((e) => [fingerprint(e), e]),
    );
  const incoming: Execution[] = [];
  const r = {
    ...remote,
    executions: remote.executions.map((e) => ({ ...e })),
    reviews: { ...remote.reviews },
  };
  for (const e of local.executions) {
    const existing =
      r.executions.find((x) => x.id === e.id) ||
      remoteByFingerprint.get(fingerprint(e));
    if (existing) {
      if (fingerprint(existing) !== fingerprint(e))
        throw new Error(
          `同步冲突：本机与云端成交 ${e.symbol} 的价格/数量不同；请先备份后核对`,
        );
      aliases.set(e.id, existing.id);
      const merged = {
        ...existing,
        note: [...new Set([existing.note, e.note].filter(Boolean))].join("\n"),
        tags: [...new Set([...existing.tags, ...e.tags])],
      };
      r.executions[r.executions.findIndex((x) => x.id === existing.id)] =
        merged;
    } else incoming.push({ ...e });
  }
  let seq = Math.max(-1, ...r.executions.map((e) => e.seq));
  r.executions.push(
    ...incoming
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.seq - b.seq)
      .map((e) => ({ ...e, seq: ++seq })),
  );
  for (const [id, note] of Object.entries(local.reviews)) {
    const target = aliases.get(id) || id,
      old = r.reviews[target];
    r.reviews[target] = {
      note: [...new Set([old?.note, note.note].filter(Boolean))].join("\n"),
      tags: [...new Set([...(old?.tags || []), ...note.tags])],
    };
  }
  const initial = emptyJournal();
  r.instruments = Object.values(mergeMap(
    recordMap(initial.instruments, i => i.symbol),
    recordMap(local.instruments, i => i.symbol),
    recordMap(remote.instruments, i => i.symbol), "股票"
  ));
  r.watchlist = same(local.watchlist, initial.watchlist)
    ? remote.watchlist
    : [...new Set([...remote.watchlist, ...local.watchlist])];
  const defaults = initial.settings;
  for (const key of [
    "capital",
    "dailyTarget",
    "defaultFee",
    "extraClosedDays",
  ] as const) {
    if (!same(local.settings[key], defaults[key])) {
      if (
        !same(remote.settings[key], defaults[key]) &&
        !same(local.settings[key], remote.settings[key])
      )
        throw new Error(`同步冲突：本机与云端${key}不同，请核对后合并`);
      (r.settings as any) = { ...r.settings, [key]: local.settings[key] };
    }
  }
  validateJournal(r);
  return sharedDocument(r);
}
