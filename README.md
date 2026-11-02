# Trade Journal

个人美股交易记录与复盘 Web MVP。React 19 + TypeScript + Vite；本地优先，无账户、无云服务也能完整记账。仅记录成交，不向券商发送订单。

## 启动

需要 Node.js 22.12+（建议 24 LTS），npm。Windows 在项目目录打开终端：

```bash
npm install
npm run dev
```

打开终端给出的地址（一般为 http://localhost:5173）。构建、检查与预览：

```bash
npm test
npm run build
npm run preview
```

不要双击 index.html。开发服务器按 Ctrl+C 停止。手机同一网络测试可打开 `http://电脑局域网IP:5173`；系统防火墙应允许该端口。PWA 安装/Service Worker 需要 HTTPS 或 localhost；普通局域网 HTTP 可记账，但不提供 PWA 离线能力。

首次打开默认展示明确标识的演示账本。点「进入正式账本」开始使用。两套账本分开保存，演示行情是合成示例。正式账本从空白开始。

## 已完成

- 快速单笔、完整补录、批量分批三种表单，统一转换为 Executions。
- 精确 Decimal FIFO：分批买卖、多对多匹配、部分平仓、买卖费用按数量分摊；最后一份分摊使用剩余费用，避免重复扣费。
- 超卖拦截，修改/删除前整本重算；删除有依赖的买入会报错，先处理后续卖出。
- 日/周/月/累计已实现净盈亏，固定本金收益率及交易自身收益率。
- 每日目标差额、负收益、超额进度、每日柱状图、盈亏日历、日期/代码/盈亏筛选与排序。
- 原始成交与未平仓列表，可查看、编辑、删除所有买入或卖出。
- Lightweight Charts K 线：1/5/15 分钟与日线、日期选择、缩放、拖动、十字光标。
- 按实际时间和实际价格绘制 B/S 标记、FIFO 买卖连接线；没有对应行情则不绘制该标记。重合点支持查看全部成交。交易表和图表联动，点击标记打开笔记详情。
- 两级笔记、自定义策略标签、筛选汇总、复制与 Markdown 导出。
- 自选添加/搜索/删除/上下排序，名称与产品类型，报价更新时间。
- CSV 成交导入、预览、重复识别、人工选择重复项、导出；完整 JSON 备份与恢复预览、校验与替换确认。
- IndexedDB 刷新恢复、原子事务、版本冲突保护、多标签页更新提示。
- 深/浅主题、响应式表格/交易卡片、手机底部导航和弹出详情、基础 PWA。

## 统计规则

`期间收益率 = 期间已实现净盈亏 ÷ 设置中的初始本金 × 100%`

初始本金默认 10000 USD、每日目标默认 1%。本金不会随盈利增长。仅卖出匹配数量确认利润；未平仓成本和未分摊买入费用不计入已实现利润。周一至周日为一周，自然月为月。按卖出成交的美东日期确认，UTC 存储，Luxon 自动处理夏令时。

每笔卖出对应一个已平仓明细，其内可以匹配多个买入批次；分批卖出保留不同记录。详情提供原始成交价格和数量。买入均价是该卖出实际匹配数量的加权成本价格，买卖费用另计。交易收益率分母为该卖出的匹配买入成本加已分摊买入费用；本金收益率始终用设置本金。

所有金融计算使用 Decimal（60 位有效数字）。价格/数量/费用以十进制字符串保存，最多 12 位小数；仅在最终展示时保留两位美元小数。图表坐标及行情价格显示使用数值，不参与账本计算。盈利蓝色、亏损黄色、零值灰色；K 线单独使用青绿涨/紫红跌。

常规 NYSE 周末/节日休市日不设每日目标，半日市仍为交易日。内置常规节日规则，设置可补充临时休市。历史临时停市、早年节日规则变更并未维护完整数据库，请按需补充。

## 历史行情配置（可选）

不提供密钥也能使用完整账本。没有真实行情时显示空状态；演示行情只在演示账本使用，并显著标注。

代码提供 `MarketProvider` 接口、`ProxyProvider` 客户端和 Twelve Data Node 代理。密钥必须放服务端，不能放任何 `VITE_*` 配置或浏览器设置。

1. 复制 `.env.example` 为 `.env`。
2. 服务端设置 `TWELVE_DATA_API_KEY=你的密钥`。
3. 设置 `VITE_MARKET_PROXY_URL=http://localhost:8787`（或在应用设置填写此 URL）。
4. 一个终端运行 `npm run market-server`，另一个运行 `npm run dev`。
5. 在股票页点「获取行情」或「更新自选报价」。服务端绑定 127.0.0.1，按允许来源 CORS 和固定上游保护密钥，缓存 60 秒。

部署在 HTTPS 的应用无法依赖浏览者的 localhost；需要自行部署 HTTPS 的可信代理，并配置匹配的 `MARKET_ALLOWED_ORIGINS`。仓库内 Node 代理用于本机开发，不是已经部署的云端行情服务。公开代理还需要自行添加访问控制与供应商额度保护。

接口：

| 路径         | 参数                         | 返回                                               |
| ------------ | ---------------------------- | -------------------------------------------------- |
| GET /history | symbol, interval, start, end | source, bars                                       |
| GET /quote   | symbol                       | symbol, name, price, change, percent, time, source |
| GET /search  | query                        | symbol/name 数组                                   |

`start/end` 为美东自然日期；分钟查询在服务端转换为 UTC，K 线 timestamps 为 UTC Unix 秒。`1day` 的时间以交易日期对应 00:00 UTC 表示。日线按交易日关联标记，分钟线在所在 bar 内按成交秒数插值定位，Y 始终是实际成交价格；缺失 bar、休市间隔不强行贴到相邻 bar。

Twelve Data：<https://twelvedata.com/docs>。请求 `time_series`、`quote`、`symbol_search`，历史使用 `adjust=none` 未复权。免费/付费、交易所权限、实时报价/延迟、分钟历史跨度均由供应商账户决定。单次最多请求 5000 根，达到上限会提示缩小范围。本次没有 API Key，未进行真实供应商联网成功验证；未声称已获得实时数据权限。

可替换供应商：只需实现 `MarketProvider` 并保持 BarSet/Quote 格式；不应改变账本。若未来使用 Polygon/Massive、Alpaca、Alpha Vantage 等，应重新核实套餐、延迟、授权和复权口径。

### 导入 OHLCV

股票页先选择股票与周期，再点「导入行情」。CSV 使用：

```csv
time,open,high,low,close,volume
2026-10-26T14:00:00Z,100,102,99,101,15000
```

以上仅说明格式，不代表真实价格。下载的格式模板带有 demo 标识，只能在演示账本导入；真实数据可省略 source 列。`time` 支持 UTC Unix 秒或明确带时区 ISO 字符串；日线用交易日 00:00 UTC。拒绝无时区分钟时间、重复时间、非法高低价。导入前会预览，确认后替换该股票该周期的缓存。来源标记为「用户导入，未经供应商核验」。切换日期范围不会凭空生成历史数据。

## 导入导出与备份

设置 → 完整备份 JSON：包含两级笔记、自选、设置、行情缓存与所有成交。恢复时先预览，并进行结构及全账本校验；会替换当前同类型账本。另一种账本不受影响。

成交 CSV 字段：`id,symbol,side,price,quantity,time,fee,note,tags,createdAt,source,ledgerMode`。必需 `symbol,side,price,quantity,time`，`side=buy|sell`，费用默认 0，标签用 `|` 分隔。时间必须明确带时区，导入后统一 UTC。`id` 可省略自动生成。同 ID 或相同股票/方向/价格/数量/费用/UTC 时间判为「可能重复」，默认跳过；确认为独立成交可手动勾选。校验全部选中项之后一次事务写入，不产生半份导入。

演示 CSV 保留 `ledgerMode=demo` 标识，不允许自动导入正式账本。CSV 不包含完整复盘笔记，迁移/恢复请使用 JSON。招商永隆券商原始 CSV 列名映射未实施，也未假定有公开交易 API。

## 目录

```text
src/
  domain/        model.ts、ledger.ts、time.ts、ledger.test.ts
  data/          storage.ts、transfer.ts、demo.ts
  market/        provider.ts（行情接口、校验和导入）
  components/    Dashboard、Stocks、PriceChart、Reviews、TradeForm、TradeDetail 等
  App.tsx        导航、账本切换与持久化操作
  styles.css     深/浅主题与响应式布局
server/
  market-proxy.mjs    可选 Node 行情代理
public/
  sw.js、manifest.webmanifest、icon*  PWA
 docs/
  DATA_MODEL.md、VALIDATION.md
```

## 数据与扩展边界

IndexedDB 数据库 `trade-journal-v1`，版本 1；`journals` store，以 `live/demo` 为键保存一个完整快照。创建与升级脚本在 `storage.ts`。不需要 SQL 或服务器数据库迁移。结构详见 `docs/DATA_MODEL.md`。

当前不含 Supabase 登录与跨设备同步；持久化通过 `load/persist` 隔离，云同步可以另加适配层，但必须设计用户身份、权限、全局版本及冲突合并后再启用。当前冲突策略是拒绝旧快照覆盖，要求重载，绝不宣称已有云同步。

同一 URL 不同浏览器/设备各有独立账本；localhost 与线上地址也各有独立账本。清除站点数据会删除本地记录。定期导出完整备份；可从同类型账本导入到其他设备。

## PWA

生产构建附 manifest、192/512px 图标和 Service Worker。首次联网打开后缓存应用壳与已加载资源；后续离线可使用本地账本。行情查询需要网络。iPhone/iPad Safari 通过分享菜单「添加到主屏幕」安装，Chrome 支持时会展示安装入口。私有站点的首次访问需要联网验证访问权限。此次仅验证构建资产，未在实体 iOS 设备测试安装或断网冷启动。

## 限制

- 不含自动下单、券商同步、回测、借券、AI 建议。
- 不支持拆股、合股、分红、税务和多币种成本。出现公司行动需先人工核对成交口径；不应把本工具当成税务报表。
- 在线行情接入代码已实现，但实际联网成功、权限和延迟尚未使用用户密钥验证。行情缺失时只可导入，不虚构。
- 日柱图为了浏览器性能最多显示范围内前 730 个自然日，区间汇总/交易列表按完整所选范围计算；可缩小范围查看其余日期。
- 无云端备份与自动同步，无法恢复未备份且已清除的浏览器数据。
- 390px 视口验证为桌面浏览器内的响应式 iframe；不是实体 iPhone/iPad 浏览器兼容性认证。

验证结果及未验证项目见 `docs/VALIDATION.md`。

## 2026-10-31 更新：未平仓复盘与说明

复盘默认同时显示已平仓明细和未平仓买入批次。每笔尚有剩余数量的买入独立显示；部分平仓后，已卖出数量在已平仓卡片确认收益，剩余数量在未平仓卡片显示。未平仓的卖出金额与收益为「—」，不参与 Dashboard 统计；原始买入数量和剩余数量分别标明。缺失的笔记段落直接隐藏。

新增状态筛选，日期对已平仓项使用卖出时间，对未平仓项使用买入时间。盈利/亏损筛选会排除未平仓项。笔记汇总、复制与 Markdown 导出包含筛选后的未平仓买入；完整备份不需要迁移即可恢复。FIFO 的剩余批次由原始成交派生，不额外保存一套财务事实。

成交时间仍按美国纽约时间填写，表单下方实时显示对应北京时间。夏令时北京快12小时、冬令时快13小时，内部 UTC 保存。走势图新增 FIFO 连线规则说明，交易详情支持展开每一批匹配数量、买卖价格、分摊费用与净盈亏。

行情选择建议：对于个人收盘复盘，可优先评估 Alpaca Basic 的历史数据接口；官方 FAQ 说明，无实时 SIP 订阅时查询 SIP 历史数据的 end 至少早于当前15分钟。免费实时 IEX 仅覆盖一个交易所，不能当成全市场综合报价。当前源码仍提供 Twelve Data 代理，尚未接入 Alpaca；这个建议不表示已配置或验证 Alpaca Key。

官方资料：<https://docs.alpaca.markets/us/docs/about-market-data-api>、<https://docs.alpaca.markets/us/docs/market-data-faq>。

## 安装到电脑和手机 / 公开发布

网页顶部「安装应用」提供浏览器原生安装入口及各平台说明。Windows/Mac 用 Chrome 或 Edge 安装；iPhone/iPad 用 Safari 的分享菜单 → 添加到主屏幕；Android 用 Chrome 菜单安装。首次联网访问完成缓存后可离线记账，行情仍需网络。

构建会生成带资源哈希的 Service Worker，预缓存应用代码、样式、图标与应用壳。每次发布使用独立缓存版本。更新可在关闭全部旧应用窗口后重新打开生效。用户的交易记录保存在自己的 IndexedDB，公开源码和公开页面不会把你的浏览器交易记录上传到仓库。

已准备 `.github/workflows/pages.yml`：仓库名 `Trading`，默认分支 `main`。推送后在 GitHub Settings → Pages → Source 选择 GitHub Actions。工作流执行 npm ci、测试及构建，按 `/Trading/` 子路径发布。只有成功推送并运行工作流后，GitHub Pages 网页才会可用。

自定义构建路径可设置 `VITE_BASE_PATH=/Trading/`；普通域名部署留空。`.env`、node_modules、dist 和本地构建状态不提交，服务端行情密钥只能自行配置在服务端。
