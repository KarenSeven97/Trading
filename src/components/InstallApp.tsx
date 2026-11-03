import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Modal } from "./common";
import { download } from "../data/transfer";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function InstallApp({ open, onOpen, onClose }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [error, setError] = useState("");
  const [shortcutRequested, setShortcutRequested] = useState(false);
  const [installed, setInstalled] = useState(() => matchMedia("(display-mode: standalone)").matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
  useEffect(() => {
    const capture = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    addEventListener("beforeinstallprompt", capture);
    addEventListener("appinstalled", done);
    return () => { removeEventListener("beforeinstallprompt", capture); removeEventListener("appinstalled", done); };
  }, []);
  async function install() {
    if (!prompt || installed) { onOpen(); return; }
    setError("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setPrompt(null);
      if (choice.outcome === "accepted") onClose();
    } catch {
      setPrompt(null);
      setError("未能打开安装窗口，请按下方步骤安装。");
      onOpen();
    }
  }
  return <>
    <button className="toolbar-button install-action" aria-label="下载安装应用" title={installed ? "应用已安装" : "下载安装应用"} onClick={() => void install()}><Download size={21}/></button>
    {open && <Modal title="下载安装" onClose={onClose}>
      <div className="form-body install-guide">
        {error && <p className="error">{error}</p>}
        {installed && <p className="success">当前已在应用模式打开</p>}
        {prompt && !installed && <button className="btn primary" onClick={() => void install()}><Download size={18}/>安装到此设备</button>}
        <button className="btn secondary desktop-shortcut" onClick={() => {
          const url = new URL(import.meta.env.BASE_URL, location.origin).href;
          download("Trading.url", `[InternetShortcut]\r\nURL=${url}\r\n`, "application/internet-shortcut");
          setShortcutRequested(true);
        }}><Download size={18}/>下载 Windows 桌面快捷方式</button>
        {shortcutRequested && <p className="success desktop-shortcut" role="status">已请求下载 Trading.url，请查看浏览器下载列表。</p>}
        <section><h3>电脑 · Windows / Mac</h3><p>Chrome / Edge → 右上角菜单 →「安装 Trade Journal」或「将此页面安装为应用」。</p></section>
        <section><h3>iPhone / iPad</h3><p>Safari → 分享 →「添加到主屏幕」。</p></section>
        <section><h3>Android</h3><p>Chrome → 菜单 →「安装应用」。</p></section>
        {!prompt && !installed && <p className="subtle-note">没有安装选项？请在 Chrome 或 Edge 中打开此网页，加载完成后重试。</p>}
      </div>
    </Modal>}
  </>;
}
