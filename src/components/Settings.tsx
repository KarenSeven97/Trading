import { useState, useRef } from "react";
import {
  Download,
  Upload,
  Sun,
  Moon,
  ShieldCheck,
  Database,
  ExternalLink,
} from "lucide-react";
import type { Journal, Settings as SettingsType } from "../domain/model";
import { validateSettings } from "../domain/ledger";
import { backup, download, executionCSV } from "../data/transfer";
import { Modal, Field } from "./common";
export function Settings({
  journal,
  onSave,
  onClose,
  onImport,
  notify,
}: {
  journal: Journal;
  onSave: (j: Journal) => Promise<void>;
  onClose: () => void;
  onImport: (file: File) => void;
  notify: (s: string) => void;
}) {
  const [s, setS] = useState<SettingsType>({ ...journal.settings }),
    [extra, setExtra] = useState(journal.settings.extraClosedDays.join("\n")),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    file = useRef<HTMLInputElement>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const next = {
        ...s,
        extraClosedDays: extra
          .split(/[\n,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
      };
      validateSettings(next);
      if (next.proxyUrl) {
        const url = new URL(next.proxyUrl, location.origin);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search
        )
          throw new Error("行情服务地址须为 HTTP(S) 且不含密钥或查询参数");
      }
      await onSave({ ...journal, settings: next });
      notify("设置已保存，所有收益率已统一重算");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="账户与数据设置" onClose={onClose} wide>
      <div className="form-body">
        <form onSubmit={save}>
          <div className="settings-title">
            <ShieldCheck size={19} />
            <h3>统计规则</h3>
            <span className="badge">本地优先</span>
          </div>
          <div className="form-grid">
            <Field
              label="初始本金 · USD"
              hint="所有期间收益率统一使用此固定分母。"
            >
              <input
                required
                inputMode="decimal"
                value={s.capital}
                onChange={(e) => setS({ ...s, capital: e.target.value })}
              />
            </Field>
            <Field
              label="每日目标收益率 · %"
              hint="仅供交易日比较，不设置周、月强制目标。"
            >
              <input
                required
                inputMode="decimal"
                value={s.dailyTarget}
                onChange={(e) => setS({ ...s, dailyTarget: e.target.value })}
              />
            </Field>
            <Field label="默认成交费用 · USD">
              <input
                required
                inputMode="decimal"
                value={s.defaultFee}
                onChange={(e) => setS({ ...s, defaultFee: e.target.value })}
              />
            </Field>
            <Field label="界面主题">
              <select
                value={s.theme}
                onChange={(e) =>
                  setS({ ...s, theme: e.target.value as "dark" | "light" })
                }
              >
                <option value="dark">深色</option>
                <option value="light">浅色</option>
              </select>
            </Field>
          </div>
          <div className="subtle-note">
            USD · America/New_York（自动处理夏令时） · FIFO 先进先出 ·
            仅统计已实现净盈亏。当前版本不提供现金出入金记账，不会把资金流入当作收益。
          </div>
          <Field
            label="额外休市日"
            hint="每行 YYYY-MM-DD；内置常规 NYSE 休市规则，临时停市可在此补充。"
          >
            <textarea
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="例如 2026-12-24（仅示例，请核实实际日历）"
            />
          </Field>
          <div className="settings-title">
            <Database size={19} />
            <h3>可选历史行情服务</h3>
          </div>
          <Field
            label="行情代理 URL"
            hint="留空也可正常记账。填写自己部署并信任的服务地址，不要填写 API Key。"
          >
            <input
              type="text"
              placeholder="例如 http://localhost:8787"
              value={s.proxyUrl}
              onChange={(e) => setS({ ...s, proxyUrl: e.target.value })}
            />
          </Field>
          <p className="muted small">
            源码附带 Twelve Data Node 代理。密钥仅在服务端 .env
            配置。免费/付费、实时/延迟和历史分钟线范围以供应商账户权限为准；此版本未内置或购买行情套餐。线上
            HTTPS 应用需要可通过 HTTPS 访问的代理。
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="form-footer">
            <span className="muted">收益率分母始终固定</span>
            <button className="btn primary" disabled={busy}>
              {busy ? "保存中…" : "保存设置"}
            </button>
          </div>
        </form>
        <div className="settings-title">
          <Database size={19} />
          <h3>备份与恢复</h3>
          <span className="badge">
            {journal.mode === "demo" ? "演示账本" : "正式账本"}
          </span>
        </div>
        <p className="muted small">
          完整备份包含成交、笔记、自选、设置与行情缓存。CSV
          仅用于成交交换，不包含完整复盘。此设备的数据不会自动同步到其他设备，请定期备份。
        </p>
        <div className="backup-actions">
          <button
            className="btn secondary"
            onClick={() =>
              download(
                `trade-journal-${journal.mode}-${new Date().toISOString().slice(0, 10)}.json`,
                backup(journal),
                "application/json",
              )
            }
          >
            <Download size={16} />
            完整备份 JSON
          </button>
          <button
            className="btn secondary"
            onClick={() =>
              download(
                `executions-${journal.mode}.csv`,
                executionCSV(journal),
                "text/csv",
              )
            }
          >
            <Download size={16} />
            成交 CSV
          </button>
          <button
            className="btn secondary"
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            导入 / 恢复
          </button>
          <button
            className="text-btn"
            onClick={() =>
              download(
                "executions-template.csv",
                "symbol,side,price,quantity,time,fee,note,tags,ledgerMode,source\nAMD,buy,100,10,2026-10-26T14:00:00Z,1,入场判断,反弹,demo,demo\nAMD,sell,105,10,2026-10-26T15:00:00Z,1,离场判断,止盈,demo,demo\n",
                "text/csv",
              )
            }
          >
            下载成交 CSV 模板
          </button>
        </div>
        <input
          hidden
          ref={file}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          onChange={(e) => {
            if (e.target.files?.[0]) onImport(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <div className="subtle-note">
          演示账本与正式账本分别保存。清除浏览器站点数据会移除本地账本；PWA
          离线可用不等于云端备份。预留的云同步边界见 README，V1
          不含登录与自动同步。
        </div>
      </div>
    </Modal>
  );
}
