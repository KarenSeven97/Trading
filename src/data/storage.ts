import { openDB } from "idb";
import { emptyJournal, type Journal } from "../domain/model";
import { cloudEnabled } from "./cloudConfig";
import { readCloud, writeCloud } from "./cloudApi";
import {
  canonical,
  mergeInitial,
  mergeShared,
  sharedDocument,
  withDeviceSettings,
} from "./cloudMerge";
import { validateJournal } from "../domain/ledger";
const db = () =>
  openDB("trade-journal-v1", 1, {
    upgrade(db) {
      db.createObjectStore("journals");
    },
  });
export async function loadLocal(mode: "live" | "demo") {
  const d = await db();
  const j: Journal | undefined = await d.get("journals", mode);
  if (j) validateJournal(j);
  return j || emptyJournal(mode);
}
export async function persistLocal(j: Journal) {
  validateJournal(j);
  const d = await db(),
    tx = d.transaction("journals", "readwrite");
  const old = (await tx.store.get(j.mode)) as Journal | undefined;
  if (old && old.revision !== j.revision) {
    await tx.done;
    throw new Error("其他标签页已更新账本，请刷新页面再试，避免覆盖新记录");
  }
  const next = { ...j, revision: j.revision + 1 };
  await tx.store.put(next, j.mode);
  if (cloudEnabled && j.mode === "live") {
    const state: SyncMeta = (await tx.store.get("cloud-state")) || {
      base: null,
      remoteRevision: null,
      pending: true,
    };
    await tx.store.put({ ...state, pending: true }, "cloud-state");
  }
  await tx.done;
  return next;
}

interface SyncMeta {
  base: Journal | null;
  remoteRevision: number | null;
  pending: boolean;
}
export interface SyncStatus {
  kind: "local" | "syncing" | "synced" | "pending" | "error";
  message: string;
  updatedAt?: string;
}
let status: SyncStatus = {
  kind: cloudEnabled ? "pending" : "local",
  message: cloudEnabled ? "等待连接共享账本" : "本地账本",
};
const listeners = new Set<() => void>();
export const getSyncStatus = () => status;
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const publish = (next: SyncStatus) => {
  status = next;
  listeners.forEach((fn) => fn());
};
let running: Promise<Journal> | null = null;
export async function syncShared(): Promise<Journal> {
  if (!cloudEnabled) return loadLocal("live");
  if (running) return running;
  running = (async () => {
    publish({ kind: "syncing", message: "正在同步共享账本…" });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const d = await db(),
          local = await loadLocal("live"),
          meta: SyncMeta | undefined = await d.get("journals", "cloud-state");
        const remote = await readCloud();
        const merged = meta?.base
          ? mergeShared(meta.base, local, remote.document)
          : mergeInitial(local, remote.document);
        const written =
          canonical(merged) === canonical(sharedDocument(remote.document))
            ? remote
            : await writeCloud(remote.revision, merged);
        if (!written) continue;
        const tx = d.transaction("journals", "readwrite"),
          current: Journal | undefined = await tx.store.get("live");
        if ((current?.revision || 0) !== local.revision) {
          await tx.done;
          continue;
        }
        const deviceDocument = withDeviceSettings(written.document, local);
        const next = canonical(deviceDocument) === canonical(local)
          ? local
          : { ...deviceDocument, revision: local.revision + 1 };
        await tx.store.put(next, "live");
        await tx.store.put(
          {
            base: sharedDocument(written.document),
            remoteRevision: written.revision,
            pending: false,
          },
          "cloud-state",
        );
        await tx.done;
        publish({
          kind: "synced",
          message: "共享账本已同步",
          updatedAt: written.updated_at,
        });
        return next;
      }
      throw new Error("共享账本持续被其他设备更新，请稍后重试；本机记录已保留");
    } catch (e) {
      publish({
        kind: "error",
        message: (e as Error).message + "（本机数据仍保留）",
      });
      throw e;
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}
export async function load(mode: "live" | "demo") {
  if (mode === "demo" || !cloudEnabled) return loadLocal(mode);
  try {
    return await syncShared();
  } catch {
    return loadLocal(mode);
  }
}
export async function persist(j: Journal) {
  const saved = await persistLocal(j);
  if (j.mode === "live" && cloudEnabled) {
    publish({ kind: "pending", message: "已保存本机，等待云端同步" });
    try {
      return await syncShared();
    } catch {
      return saved;
    }
  }
  return saved;
}
// Conflicts are never auto-resolved by overwriting another device. The UI requires a local backup and explicit selection.
export async function useCloudVersion() {
  const remote = await readCloud(),
    d = await db(),
    tx = d.transaction("journals", "readwrite");
  const current: Journal = (await tx.store.get("live")) || emptyJournal();
  const next = {
    ...withDeviceSettings(remote.document, current),
    revision: current.revision + 1,
  };
  await tx.store.put(next, "live");
  await tx.store.put(
    {
      base: sharedDocument(remote.document),
      remoteRevision: remote.revision,
      pending: false,
    },
    "cloud-state",
  );
  await tx.done;
  publish({
    kind: "synced",
    message: "已载入云端账本",
    updatedAt: remote.updated_at,
  });
  return next;
}
