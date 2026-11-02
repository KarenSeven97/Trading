import type { Journal } from "../domain/model";
import { validateJournal } from "../domain/ledger";
import { cloudConfig } from "./cloudConfig";
export interface CloudRow {
  id: string;
  revision: number;
  document: Journal;
  updated_at: string;
}
async function request(path: string, body?: unknown) {
  const r = await fetch(cloudConfig.url + "/rest/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      apikey: cloudConfig.key,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    throw new Error(
      `云端同步失败 (${r.status})：${error.message || "请检查网络后重试"}`,
    );
  }
  return r.json();
}
function row(data: any): CloudRow {
  if (!data || !Number.isSafeInteger(Number(data.revision)))
    throw new Error("云端版本格式错误");
  validateJournal(data.document);
  return { ...data, revision: Number(data.revision) };
}
export async function readCloud() {
  const rows = await request("trading_shared_ledger?id=eq.main&select=*");
  if (!rows[0]) throw new Error("共享账本尚未初始化");
  return row(rows[0]);
}
export async function writeCloud(
  revision: number,
  document: Journal,
): Promise<CloudRow | null> {
  const rows = await request("rpc/trading_write_ledger", {
    expected_revision: revision,
    new_document: document,
  });
  return rows.length ? row(rows[0]) : null;
}
