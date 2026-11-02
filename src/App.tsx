import { InstallApp } from "./components/InstallApp";
import { useEffect, useState, useMemo, useRef } from "react";
import {
  BarChart3,
  ChartCandlestick,
  NotebookPen,
  Settings as SettingsIcon,
  Plus,
  PanelLeftClose,
  ArrowUpRight,
  ShieldCheck,
  Sun,
  Moon,
  CheckCircle2,
  AlertCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  emptyJournal,
  uid,
  type Journal,
  type Execution,
} from "./domain/model";
import { calculate, money } from "./domain/ledger";
import { et } from "./domain/time";
import { load, persist } from "./data/storage";
import { demoJournal } from "./data/demo";
import { parseBackup, parseExecutions } from "./data/transfer";
import { Dashboard, type Range } from "./components/Dashboard";
import { Stocks } from "./components/Stocks";
import { Reviews } from "./components/Reviews";
import { TradeForm } from "./components/TradeForm";
import { TradeDetail } from "./components/TradeDetail";
import { Settings } from "./components/Settings";
import { ImportPreview, type ImportData } from "./components/ImportPreview";
import "./styles.css";
type Page = "dashboard" | "stocks" | "reviews";
function initialPage(): Page {
  const p = location.hash.slice(1);
  return ["dashboard", "stocks", "reviews"].includes(p)
    ? (p as Page)
    : "dashboard";
}
export default function App() {
  const instanceId = useRef(uid());
  const [journal, setJournal] = useState<Journal | null>(null),
    [page, setPage] = useState<Page>(initialPage),
    [mode, setMode] = useState<"live" | "demo">(() =>
      (() => {
        try {
          return localStorage.getItem("tj-mode") === "live" ? "live" : "demo";
        } catch {
          return "demo";
        }
      })(),
    ),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [notice, setNotice] = useState(""),
    [settingsOpen, setSettingsOpen] = useState(false),
    [form, setForm] = useState<{ editing?: Execution } | null>(null),
    [detail, setDetail] = useState<{
      tradeId?: string;
      executionId?: string;
    } | null>(null),
    [symbol, setSymbol] = useState("AMD"),
    [focusId, setFocusId] = useState<string>(),
    [importData, setImportData] = useState<ImportData | null>(null),
    [range, setRange] = useState<Range>({
      start: et().startOf("month").toISODate()!,
      end: et().toISODate()!,
    }),

    [stale, setStale] = useState(false);
  const ledger = useMemo(
    () => (journal ? calculate(journal.executions) : null),
    [journal],
  );
  function notify(s: string) {
    setNotice(s);
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFatal("");
    setDetail(null);
    setForm(null);
    setSettingsOpen(false);
    setImportData(null);
    load(mode)
      .then(async (j) => {
        if (j.mode === "demo" && j.revision === 0)
          j = await persist(demoJournal());
        if (!cancelled) {
          setJournal(j);
          setStale(false);
          try {
            localStorage.setItem("tj-mode", mode);
          } catch {
            /* UI preference is optional. */
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setFatal("无法读取本地账本：" + e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (journal)
      document.documentElement.dataset.theme = journal.settings.theme;
  }, [journal?.settings.theme]);
  useEffect(() => {
    const h = () => setPage(initialPage());
    addEventListener("hashchange",h);
    return ()=>removeEventListener("hashchange",h);
  }, []);
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const ch = new BroadcastChannel("tj-updates");
    ch.onmessage = (e) => {
      if (
        e.data.sender !== instanceId.current &&
        e.data.mode === mode &&
        journal &&
        e.data.revision > journal.revision
      )
        setStale(true);
    };
    return () => ch.close();
  }, [mode, journal?.revision]);
  async function save(next: Journal) {
    if (stale) throw new Error("账本已在其他页面更新，请先刷新");
    const result = await persist(next);
    setJournal(result);
    if ("BroadcastChannel" in window) {
      const ch = new BroadcastChannel("tj-updates");
      ch.postMessage({
        mode: result.mode,
        revision: result.revision,
        sender: instanceId.current,
      });
      ch.close();
    }
    notify("已保存到当前浏览器");
  }
  function nav(p: Page) {
    location.hash = p;
    setPage(p);
  }
  function chart(s: string, id: string) {
    setSymbol(s);
    setFocusId(id);
    setDetail(null);
    nav("stocks");
  }
  function openExecution(e: Execution) {
    const related =
      ledger?.trades.filter(
        (t) => t.id === e.id || t.buys.some((b) => b.id === e.id),
      ) || [];
    setDetail(
      related.length === 1 ? { tradeId: related[0].id } : { executionId: e.id },
    );
  }
  async function remove(e: Execution) {
    if (!journal) return;
    if (
      !confirm(
        `确认删除 ${e.symbol} 的${e.side === "buy" ? "买入" : "卖出"}成交？将重新计算全部匹配与收益。`,
      )
    )
      return;
    try {
      const reviews = { ...journal.reviews };
      delete reviews[e.id];
      await save({
        ...journal,
        executions: journal.executions.filter((x) => x.id !== e.id),
        reviews,
      });
      setDetail(null);
      notify("成交已删除，账本已重新计算");
    } catch (err) {
      notify((err as Error).message);
    }
  }
  async function fileImport(file: File) {
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("文件超过 30MB，请缩小文件后重试");
      const text = await file.text();
      setImportData(
        file.name.toLowerCase().endsWith(".json")
          ? { type: "backup", journal: parseBackup(text) }
          : {
              type: "csv",
              rows: parseExecutions(text, journal!.executions, mode),
            },
      );
      setSettingsOpen(false);
    } catch (e) {
      notify("导入失败：" + (e as Error).message);
    }
  }
  const navItems = [
    {
      id: "dashboard" as Page,
      label: "交易表现",
      en: "Overview",
      Icon: BarChart3,
    },
    {
      id: "stocks" as Page,
      label: "股票与点位",
      en: "Market & trades",
      Icon: ChartCandlestick,
    },
    {
      id: "reviews" as Page,
      label: "交易复盘",
      en: "Journal",
      Icon: NotebookPen,
    },
  ];
  if (loading)
    return (
      <div className="app-loading">
        <div className="brand-mark">
          <BarChart3 size={24} />
        </div>
        <h2>Trade Journal</h2>
        <div className="spinner" />
        <p>正在读取本地账本…</p>
      </div>
    );
  if (fatal || !journal)
    return (
      <div className="app-loading">
        <AlertCircle size={32} />
        <h2>本地存储暂不可用</h2>
        <p>{fatal}</p>
        <p>
          请检查浏览器存储权限或退出受限隐私模式。为避免丢失数据，应用不会退回不可靠的临时账本。
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          重试
        </button>
      </div>
    );
  const detailTrade = detail?.tradeId
      ? ledger?.trades.find((t) => t.id === detail.tradeId)
      : undefined,
    detailExecution = detail?.executionId
      ? journal.executions.find((e) => e.id === detail.executionId)
      : undefined;
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={() => nav("dashboard")}>
          <span className="brand-mark">
            <BarChart3 size={21} />
          </span>
          <div>
            Trade Journal<small>个人交易记录与复盘</small>
          </div>
        </a>
        <span className="sidebar-label">WORKSPACE</span>
        <nav>
          {navItems.map(({ id, label, en, Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => nav(id)}
            >
              <Icon size={19} />
              <span>
                {label}
                <small>{en}</small>
              </span>
              {page === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-rule" />
        <div className="ledger-select">
          <span className="sidebar-label">当前账本</span>
          <div className="segmented">
            <button
              className={mode === "live" ? "active" : ""}
              onClick={() => setMode("live")}
            >
              正式
            </button>
            <button
              className={mode === "demo" ? "active" : ""}
              onClick={() => setMode("demo")}
            >
              演示
            </button>
          </div>
          <p>
            {mode === "demo"
              ? "演示数据独立保存，放心探索。"
              : "你的成交只保存在当前浏览器。"}
          </p>
        </div>
        <div className="sidebar-bottom">
          <div className="capital-card">
            <span>
              固定初始本金 <ShieldCheck size={14} />
            </span>
            <strong>{money(journal.settings.capital, false)}</strong>
            <small>所有收益率的统一基准</small>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon size={18} />
            账户与数据设置
          </button>
          <div className="sidebar-footer">
            <span className="status-dot" />
            本地优先 · V1.0{" "}
            <button
              className="icon-btn"
              aria-label="切换深浅主题"
              onClick={() =>
                void save({
                  ...journal,
                  settings: {
                    ...journal.settings,
                    theme: journal.settings.theme === "dark" ? "light" : "dark",
                  },
                }).catch((e) => notify(e.message))
              }
            >
              {journal.settings.theme === "dark" ? (
                <Sun size={16} />
              ) : (
                <Moon size={16} />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            我的工作区 <span>/</span>{" "}
            <b>{navItems.find((n) => n.id === page)?.label}</b>
          </div>
          <div className="topbar-actions">
            <InstallApp />
            <span className="clock">
              <span className="status-dot" />
              {et().toFormat("yyyy.MM.dd")} · 美东 ET
            </span>
            <button
              className="mobile-mode badge"
              onClick={() => setMode(mode === "demo" ? "live" : "demo")}
            >
              {mode === "demo" ? "演示账本 ⇄" : "正式账本 ⇄"}
            </button>
            <button
              className="icon-btn mobile-settings"
              aria-label="设置"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon size={20} />
            </button>
            <button
              className="btn primary add-trade"
              onClick={() => setForm({})}
            >
              <Plus size={17} />
              <span>新增交易</span>
            </button>
          </div>
        </header>
        {mode === "demo" && (
          <div className="demo-banner">
            <span className="badge">DEMO</span>
            <span>
              正在浏览演示账本。成交与合成行情均为示例，不计入正式统计。
            </span>
            <button onClick={() => setMode("live")}>
              进入正式账本 <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {stale && (
          <div className="stale-banner">
            其他标签页已更新账本。
            <button className="text-btn" onClick={() => location.reload()}>
              刷新以载入最新记录
            </button>
          </div>
        )}
        <main className="content">
          {page === "dashboard" ? (
            <Dashboard
              journal={journal}
              range={range}
              setRange={setRange}
              onOpen={(id) => setDetail({ tradeId: id })}
              onChart={chart}
              onExecution={openExecution}
            />
          ) : page === "stocks" ? (
            <Stocks
              journal={journal}
              symbol={symbol}
              setSymbol={(s) => {
                setSymbol(s);
                setFocusId(undefined);
              }}
              focusId={focusId}
              onExecution={openExecution}
              onSave={save}
              notify={notify}
              onSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <Reviews
              journal={journal}
              onOpenExecution={(e) => setDetail({ executionId: e.id })}
              onOpen={(id) => setDetail({ tradeId: id })}
              onChart={chart}
              notify={notify}
            />
          )}
        </main>
        <footer className="app-footer">
          <span>
            Trade Journal <span className="muted">/</span>{" "}
            每一次交易，都值得复盘。
          </span>
          <span>
            <ShieldCheck size={13} />
            数据留在你的设备
          </span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {navItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => nav(id)}
          >
            <Icon size={21} />
            <span>
              {id === "dashboard" ? "表现" : id === "stocks" ? "股票" : "复盘"}
            </span>
          </button>
        ))}
      </nav>
      <button
        className="mobile-fab"
        aria-label="新增交易"
        onClick={() => setForm({})}
      >
        <Plus size={26} />
      </button>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {form && (
        <TradeForm
          journal={journal}
          editing={form.editing}
          initialSymbol={page === "stocks" ? symbol : undefined}
          onSave={save}
          onClose={() => setForm(null)}
        />
      )}{" "}
      {detail && (detailTrade || detailExecution) && (
        <TradeDetail
          key={detailTrade?.id || detailExecution?.id}
          journal={journal}
          trade={detailTrade}
          execution={detailExecution}
          relatedTrades={ledger?.trades.filter((t) =>
            t.buys.some((b) => b.id === detailExecution?.id),
          )}
          onOpenTrade={(id) => setDetail({ tradeId: id })}
          onClose={() => setDetail(null)}
          onSave={save}
          onEdit={(e) => {
            setDetail(null);
            setForm({ editing: e });
          }}
          onDelete={(e) => void remove(e)}
          onChart={chart}
        />
      )}{" "}
      {settingsOpen && (
        <Settings
          journal={journal}
          onSave={save}
          onClose={() => setSettingsOpen(false)}
          onImport={(file) => void fileImport(file)}
          notify={notify}
        />
      )}{" "}
      {importData && (
        <ImportPreview
          journal={journal}
          data={importData}
          onSave={save}
          onClose={() => setImportData(null)}
          notify={notify}
        />
      )}
    </div>
  );
}
