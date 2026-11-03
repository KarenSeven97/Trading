import { Settings2 } from "lucide-react";
import type { money } from "../domain/ledger";

export function FundsCard({ capital, occupied, available, format, onEdit, rateLabel, rateTitle }: {
  capital: string;
  occupied: string;
  available: string;
  format: typeof money;
  onEdit: () => void;
  rateLabel: string;
  rateTitle: string;
}) {
  return <div className="funds-summary">
    <div className="funds-rate" title={rateTitle} aria-label="美元人民币参考汇率">{rateLabel}</div>
    <section className="capital-card account-funds" aria-label="本金概览">
      <div className="funds-principal">
        <div className="funds-label">初始本金<button className="icon-btn" aria-label="调整本金" title="调整本金" onClick={onEdit}><Settings2 size={14}/></button></div>
        <strong>{format(capital, false)}</strong>
      </div>
      <div><span className="funds-label">未平仓占用</span><b>{format(occupied, false)}</b></div>
      <div><span className="funds-label">剩余可用</span><b>{format(available, false)}</b></div>
    </section>
  </div>;
}
