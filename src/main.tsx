import ReactDOM from "react-dom/client";
import App from "./App";
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const register = () => {
    void navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch((error) => {
      console.warn("Trade Journal: 离线缓存注册失败", error);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
