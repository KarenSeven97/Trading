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

          </div>
          <div className="form-grid">
            <Field
              label="初始本金 · USD"

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
            USD · 美东时间 · FIFO · 仅已实现盈亏
          </div>
          <Field
            label="额外休市日"
            hint="每行 YYYY-MM-DD"
          >
            <textarea
              rows={2}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </Field>
          <div className="settings-title">
            <Database size={19} />
            <h3>历史行情</h3>
          </div>
          <Field
            label="行情代理 URL"
            hint="填写可信服务地址，请勿填写 API Key"
          >
            <input
              type="text"
              placeholder="留空使用内置 Alpaca IEX 免费行情"
              value={s.proxyUrl}
              onChange={(e) => setS({ ...s, proxyUrl: e.target.value })}
            />
          </Field>
          <p className="muted small">
            Alpaca IEX：单一交易所，可能缺少 K 线。暂不支持拆股等公司行动。
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          <div className="form-footer">

            <button className="btn primary" disabled={busy}>
              {busy ? "保存中…" : "保存设置"}
            </button>
          </div>
        </form>
        <div className="settings-title">
          <Database size={19} />
          <h3>备份与恢复</h3>

        </div>
        <p className="muted small">
          JSON 包含全部数据；CSV 仅包含成交。
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
                "symbol,side,price,quantity,time,fee,note,tags,ledgerMode,source\nAMD,buy,100,10,2026-10-26T14:00:00Z,1,入场判断,反弹,live,manual\nAMD,sell,105,10,2026-10-26T15:00:00Z,1,离场判断,止盈,live,manual\n",
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
          共享记录无需登录，所有访问者均可编辑。清除本机数据前，请先同步或备份。
        </div>
      </div>
    </Modal>
  );
}
