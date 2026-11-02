# 数据模型与一致性

所有财务数值（初始本金、价格、数量、费用、盈亏）以十进制字符串表示。执行时以 Decimal 计算，UTC ISO 时间保存。原始成交是持仓与盈亏的唯一事实来源，日报不单独写入。

| 实体              | 保存内容                                                                                           | 键与关系                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Journal           | version、revision、mode 及下列集合                                                                 | IndexedDB `journals` 的 live/demo 键                       |
| AccountSettings   | capital、dailyTarget、currency、timezone、defaultFee、costMethod、theme、proxyUrl、extraClosedDays | 每个账本独立设置                                           |
| Instrument        | symbol、name、exchange、type                                                                       | symbol；已知股票、ETF、反向 ETF，可扩充                    |
| Execution         | id、symbol、side、price、quantity、fee、time、note、tags、source、seq、createdAt、updatedAt        | 稳定 UUID；同时间用 seq 再用 id 排序                       |
| TradeMatch        | buy、sell、quantity、cost、proceeds、buyFee、sellFee、pnl                                          | 从执行记录派生，稳定 buyID:sellID                          |
| ClosedTrade       | sell、matches、buys、quantity、avgBuy、fees、pnl、returnPct                                        | 按 sellID 聚合，保留所有买入批次与每笔卖出                 |
| Review            | note、tags                                                                                         | reviews[sellID]；对应一笔平仓卖出，可含多个 FIFO 匹配      |
| Watchlist         | symbol 有序列表                                                                                    | 使用数组顺序；与成交独立                                   |
| PriceBar / BarSet | symbol、interval、source、demo、importedAt、bars（UTC 秒 + OHLCV）                                 | 按 symbol/interval 缓存，不参与盈亏计算                    |
| Position          | quantity、cost、remainingFee                                                                       | FIFO 剩余批次派生，不是市值/未实现盈亏                     |
| DailySummary      | pnl、count                                                                                         | 按卖出的美东日期派生，每笔卖出计一笔平仓，不按匹配碎片计数 |

持久化流程：候选快照 → 全结构校验 → 全成交排序和 FIFO 计算 → IndexedDB 读写事务检查 revision → 替换同账本快照 → revision+1 → 更新界面并通知其他标签页。

任何超卖均拒绝整次保存，包括修改历史日期或删除早期买入后造成的超卖。没有负仓位或静默丢弃成交。已有笔记按稳定 sellID 保留；删除卖出时删除对应复盘。删除买入时，仅当之后卖出仍能匹配才允许。

FIFO 的费用分配：每个批次保存剩余数量与剩余买入费用。每次取 min(剩余持仓, 剩余卖出)，分摊剩余费用 × 本次匹配数量 / 剩余数量；如果取完则直接使用剩余费用。卖出费用同理分到多个匹配。未平仓买入费用暂不确认；再次卖出时确认剩余部分。

备份恢复与 CSV 导入都先建立候选账本并通过相同计算器，然后一次写入。备份版本不兼容、损坏行情、无效数字、超卖、账本类型不一致会拒绝导入。恢复保留当前本地 revision 以避免跨标签页覆盖。

V1 不需要外部数据库迁移。未来 IndexedDB schema 升级应增加 openDB version 并提供 migration；云端实现需要用户标识、稳定记录 ID、服务端唯一约束与显式冲突处理。现有 revision 只保护本地，不是跨设备同步协议。

复盘新增 `OpenLot` 派生类型：`buy`（原始买入成交）、`quantity`（剩余数量）、`cost` 与 `remainingFee`。由 FIFO 剩余队列生成，不写入 IndexedDB，也不计入日报。复盘卡片分别显示原始买入量与剩余量，避免把部分平仓的原始数量误认为仍在持仓。

## Public shared ledger (B mode)
`database/shared-ledger.sql` declares the Supabase container, SELECT/UPDATE RLS for anon/authenticated, document validation trigger and SECURITY INVOKER CAS RPC. The main row is never deleted; deleting an execution updates its JSON document. revision is a server-side concurrency token distinct from the local IndexedDB revision. Cloud document.revision is always 0, and derived profits are never a separately persisted source of truth. Each browser stores a baseline snapshot for three-way merges and pending offline writes. Local cache/appearance/proxy settings and all demo data remain device-local. No identity is created.
