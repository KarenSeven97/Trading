import { DollarSign, JapaneseYen } from "lucide-react";

/** Display the currency that clicking the button will switch to. */
export function CurrencySwapIcon({ currency }: { currency: "USD" | "CNY" }) {
  const Icon = currency === "USD" ? JapaneseYen : DollarSign;
  return <Icon aria-hidden="true" size={22} />;
}
