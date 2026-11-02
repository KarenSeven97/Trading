import { openDB } from "idb";
import { emptyJournal, type Journal } from "../domain/model";
import { validateJournal } from "../domain/ledger";
const db = () =>
  openDB("trade-journal-v1", 1, {
    upgrade(db) {
      db.createObjectStore("journals");
    },
  });
export async function load(mode: "live" | "demo") {
  const d = await db();
  const j: Journal | undefined = await d.get("journals", mode);
  if (j) validateJournal(j);
  return j || emptyJournal(mode);
}
export async function persist(j: Journal) {
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
  await tx.done;
  return next;
}
