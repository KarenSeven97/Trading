import { MoneyContext } from "./currency/display";
import { displayMoney } from "./currency/fx";
import { useCurrency } from "./currency/useCurrency";
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
import { load, persist, loadLocal, syncShared, useCloudVersion, getSyncStatus, subscribeSync } from "./data/storage";
import { cloudEnabled } from "./data/cloudConfig";
import { accountFunds } from "./domain/funds";
import { backup, download, parseBackup, parseExecutions } from "./data/transfer";
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
  const [syncStatus, setSyncStatus] = useState(getSyncStatus);
  useEffect(() => subscribeSync(() => setSyncStatus(getSyncStatus())), []);
  const [journal, setJournal] = useState<Journal | null>(null),
    [page, setPage] = useState<Page>(initialPage),
    [mode] = useState<"live" | "demo">("live"),
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
  const fx = useCurrency(s => setNotice(s));
  const viewMoney = useMemo(() => (value: Parameters<typeof money>[0], sign=true) => displayMoney(value, sign, fx.currency, fx.rate), [fx.currency, fx.rate]);
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
  async function refreshShared() {
    try {
      const next = await syncShared();
      setJournal(current => current?.mode === "live" ? next : current);
      setStale(false);
    } catch (e) { notify((e as Error).message); }
  }
  useEffect(() => {
    if (!cloudEnabled || mode !== "live" || loading || form || detail || settingsOpen || importData) return;
    let cancelled = false;
    const refresh = () => { void syncShared().then(next => {
      if (!cancelled) { setJournal(next); setStale(false); }
    }).catch(() => {}); };
    const timer = setInterval(refresh, 15000);
    addEventListener("focus", refresh);
    addEventListener("online", refresh);
    return () => { cancelled = true; clearInterval(timer); removeEventListener("focus", refresh); removeEventListener("online", refresh); };
  }, [mode, loading, form, detail, settingsOpen, importData]);
  async function resolveCloudConflict() {
    try {
      const local = await loadLocal("live");
      download(`trading-before-cloud-${Date.now()}.json`, backup(local), "application/json");
      if (!confirm("本机完整备份已下载。载入云端会放弃本机尚未同步的修改，请确认备份文件已保存。继续？")) return;
      setJournal(await useCloudVersion()); setStale(false);
    } catch(e) { notify((e as Error).message); }
  }
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
    notify(result.mode === "live" && cloudEnabled ? (getSyncStatus().kind === "synced" ? "已保存并同步到共享账本" : "已保存本机，云端尚未同步；请查看同步提示") : "已保存到当前浏览器");
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
        <p>正在读取账本…</p>
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
  const funds = accountFunds(journal);
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
        <div className="sidebar-bottom">
          <div className="capital-card">
            <span>
              初始本金 <ShieldCheck size={14} />
            </span>
            <strong>{viewMoney(journal.settings.capital, false)}</strong>
            <button className="text-btn" onClick={() => setSettingsOpen(true)}>调整本金</button>
            <small>未平仓占用（含买入费用）</small><b>{viewMoney(funds.occupied, false)}</b>
            <small>剩余可用（含已实现盈亏）</small><b>{viewMoney(funds.available, false)}</b>
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
            <button className={`text-btn sync-button ${syncStatus.kind}`} title={syncStatus.message} aria-label="同步账本" disabled={syncStatus.kind === "syncing" || !!form || settingsOpen || !!importData || !!detail} onClick={() => void refreshShared()}><RefreshCw size={15} className={syncStatus.kind === "syncing" ? "spin" : ""} /><span>{syncStatus.kind === "syncing" ? "同步中" : syncStatus.kind === "error" ? "同步失败" : syncStatus.kind === "pending" ? "待同步" : "同步"}</span></button>
            <div className="currency-control"><button className="text-btn currency-toggle" aria-label="切换美元人民币显示" aria-pressed={fx.currency === "CNY"} disabled={fx.busy} onClick={fx.toggle} title="仅转换交易表现和本金区域；股票及成交单价保持 USD">{fx.busy ? "获取汇率…" : fx.currency === "USD" ? "USD ⇄ 人民币" : "人民币 ⇄ USD"}</button>{fx.currency === "CNY" && fx.rate && <small title="Frankfurter 每日参考汇率，非银行成交汇率">1 USD = {fx.rate.rate} CNY · {fx.rate.date}</small>}</div>
            <InstallApp />
            <span className="clock">
              <span className="status-dot" />
              {et().toFormat("yyyy.MM.dd")} · 美东 ET
            </span>
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
        {syncStatus.kind === "error" && <div className="sync-error" role="alert"><span>{syncStatus.message}</span><button className="text-btn" onClick={() => void resolveCloudConflict()}>备份并载入云端</button></div>}
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
            <MoneyContext.Provider value={viewMoney}><Dashboard
              journal={journal}
              range={range}
              setRange={setRange}
              onOpen={(id) => setDetail({ tradeId: id })}
              onChart={chart}
              onExecution={openExecution}
            /></MoneyContext.Provider>
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
