const names: Record<string,string> = {
 AMD:'超威半导体公司', NVDA:'英伟达', AAPL:'苹果公司', MSFT:'微软',
 QQQM:'景顺纳斯达克100 ETF', QQQ:'景顺纳斯达克100 ETF', SPY:'标普500 ETF', VOO:'先锋标普500 ETF',
 SOXS:'半导体三倍反向 ETF', SQQQ:'纳斯达克100三倍反向 ETF', QID:'纳斯达克100两倍反向 ETF',
 AAPD:'苹果每日反向 ETF', TSLA:'特斯拉', AMZN:'亚马逊', META:'Meta 平台公司', GOOGL:'谷歌母公司 Alphabet', GOOG:'谷歌母公司 Alphabet', INTC:'英特尔'
};
export function instrumentName(symbol:string, fallback?:string) {
 return names[symbol.toUpperCase()] || (fallback && fallback !== symbol ? fallback : symbol);
}
