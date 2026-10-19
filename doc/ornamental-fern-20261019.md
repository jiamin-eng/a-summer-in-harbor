# 观赏蕨本地接入交接

批准：主对话 `01a13c07-36d0-7171-bf8d-e1d6761df03f` 保留用户 `Sentinel_9f977561eaa88191a2d1f378bfea2cfd` 对整包方案的直接“同意”。范围为本地接入、合成测试、修复和交既有品控验收；发布仍独立。受众／故事／中英语言沿用海湾，动物第二章 OFF。

## 已实现的玩家闭环

原工具袋线完成后，近处与 Mara 交谈：听赠礼提议→沿既有分页／阅读恢复读完→明确接受或以后再说。每旅程一盆另有来源的成熟蕨。打开面板／读取存档不授予，原工具袋 +3 关系奖励不改，不新增关系奖励或钱。

行囊只在 holder=bag 时计一株，图片是既有 plant.png，经原透明 key 解码；显示 Mara 来源和租屋地图入口。房间右侧固定目标 owned-fern-slot，与公共 growing-fern 和旧 home/fern 无关。点目标只寻路；走近、点互动，再确认带明示成本的放下／收回按钮。每成功移动4精力／20游戏分钟／$0，原疲劳照常结算。目标空时没有隐形碰撞，摆放时同源16×12盆底进入碰撞；渲染、实体和权威共用位置 `(670,350)`／接近 `(662,378)`。新实例显示宽30，不改变旧家具。

赠礼本身不额外快进或收费，既有活动时间先正常结算。领取年龄1440，之后由同一 townMinutes 推导；bag和场景一致，移动不重置。无浇水／枯死／售卖／生产／留种。继续／刷新／收回不重新领取。

## 保存和装配

- 正式根是可选 `ornamentalFernV1`，与历史 fixture-only `ownedFernV1` 分开。两个专用 flag 只作 holder 的渲染／碰撞投影，strict reader 核对其一致性，不能独立赋予所有权。
- `server/ornamental-fern.ts` 只装配一次，嵌在原 active-play、weather、plants、animals、news 和 CAS／event／receipt 边界内；无新表、数据库或服务。失败候选不写原 head；同 ID 返回原回执、不同 ID 同版本竞争只成功一次。
- 新动作只接受固定命令、当前 scene／target／实际接近点，拒绝 payload 准入证明。moving／active 旅程还核保存位置；成熟盆位占用、玩家占位、无路或不足精力均不变状态。
- `createExplorationAssembly({ornamentalFernStarts:false})` 关闭新赠礼，保留正式 reader 和已拥有盆蕨的摆放／收回。不要通过删根或回滚数据库停新。
- 客户端发送公开格式能力 `X-Harbor-Fern:1`，Worker 只转发精确1。新动作缺头，以及已拥有盆蕨的会话／life／land-preview读取缺头，返回409 `CLIENT_REFRESH_REQUIRED`、terminal:false。不是身份或权限变更；旧无蕨旅程仍可读。正式根不受旧未启用内核的测试 admission 控制。
- 不支持的正式根返回503、terminal:false，保留恢复；普通明确玩法拒绝为409 terminal:true。`public.ts` 仅让显式 terminal 字段传出，未接触部署配置或凭据。

## 验证与边界

选定当前回归90/90通过，含11个新增观赏蕨用例，以及 Dani、原三位关系、Owen、土地、罗勒、留种、旧内核和实际 Worker→账号API→SQLite链。原 authority 的并发、回执故障、重启／账号隔离和未知结果重试均保留。新 UI 只做 React 静态状态检查，不称真实浏览器通过。

更广的99项试跑96通过；旧 `_qa/samira-approach.test.ts` 三失败在未改 `2ef1119` 副本同名复现：一项依赖未包含的历史非祖先 c9 对象，另一项断言后来已演进的4451全世界，第三项为旧座席默认接近假设。本轮没有改 Samira；无蕨世界碰撞和整个 chapel 已与2ef逐字段比对一致。原日志与基线复现保留，不删断言改绿。它们不计入当前90项；不能宣称全历史套件通过。

TypeScript和构建通过。所有public素材字节、Dani关系实现、动物和身份实现相对2ef保留；本任务没开浏览器、没安装、没请求模型或媒体、没用真实玩家或生产服务。真实renderer／触控／手机／Telegram／PG和新玩家理解仍由原品控接续，不能从这些测试推断通过。

## 既有品控接入

本任务根 `qa-fern-20261019/` 提供 `QA-HANDOFF.md`、冻结产物清单／包和12个 `.fixture.json`。每份是 `{fixtureSchema:1, synthetic:true, preparation, save}` 封套，禁止直接当生产存档上传。

使用 `_qa/ornamental-fern-qa.ts` 的 `loadOrnamentalFernQaFixture(file,id,locale)`，在 QA 自己的新 enrollment initial 回调内载入。函数会把新合成 journey ID 同时写入 ownerJourney，保留来源action／实例和历史，不伪称玩家迁移。必须在首次权威写入前做，严禁对真实存档使用。原 QA 的新 source／Worker／后台／frozen-dist 均固定同一候选；沿用其资源基线、停止条件和唯一自有浏览器，不在旧报告目录覆盖。

主用 ready-en/zh 从赠礼前走完整真实入口；offer-read用于中途关闭／刷新续读；bag-home、displayed-home、returned-home用于同实例／位置；low-energy-home用于禁用和保留。旧钥匙／安顿／工具袋前置由真实作者命令生成，但命令接近点是合成离线位置，不当作浏览器行走证据。home快照的接近点和低精力也明确合成。

离线复跑：`node --import tsx --test --test-concurrency=1 _qa/ornamental-fern.test.ts`。12份快照可由 `node --import tsx _qa/export-ornamental-fern-fixtures.ts /new/qa/root/fixtures` 再生成，ID会重新随机，须重新登记其哈希。没有新的发布或多人范围。
