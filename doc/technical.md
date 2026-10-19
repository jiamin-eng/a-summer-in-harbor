# 《海湾新生活》技术文档

## 2026-10-09 平台登录与账号存档候选

本轮基于正式 `00c4dbf37bee9ee87b8c6717b671d6b5644030f1`。该提交的固定动物故事已在现有 ECS、主站与 Pages 发布并回读；下方动物候选和更早章节是历史记录。本轮登录改造仅独立本地候选，未获得新的生产切换授权。

真实登录反馈后的独立只读诊断受Chrome Apple Events JavaScript关闭阻挡，未刷新或修改用户标签。原guest-shell隔离成功响应复现统计GET迟到时，游戏已显示新游戏却仍持有entryLock。平台登录调用现以原shell有效live ID为完成信号，不等待无关stats reply；所有late reply有处理但不重新锁定入口。原窗口已关闭2秒仍无身份时显示明确账号未同步反馈，不猜ID、不读token、不重新认证。四种原shell成功/统计pending/统计503/缺ID情形均用本地fixture验证；不把fixture当用户实际成功记录。

`transport.ts` 在首次 bootstrap 前启用原 IdentityEpoch，仅消费 live Aigram ID；没有 ID 时不发游戏请求。顶层页面仅 query 伪装的 shell 不成为宿主身份。`platform-login.ts` 通过原 guest-shell 保护 GET 打开原邮箱验证码窗口，成功后读取 live ID；没有自造表单、认证内核、token或 Telegram 验签。沿用用户接受的 temporary-unverified 信任范围，不能把客户端 ID称为服务端认证。

首页 AccountStart 仅登录门禁、继续和新游戏；无档只给新游戏。入口目录只读，取消/失败不建档，不自动进入游戏。Continue 按服务端 updated 排序读取最近游玩档，忽略旧本地指针；显式 New 复用原幂等 enrollment 与100档上限，不覆盖或删旧档。System 内原 Journeys 管理继续复用，选档与新档确认保留；不重做既有菜单。

`server/public.ts` 保持 `createReviewedAnimalLife`、原 news/plants/crab/basil/mint/active-play/compact-motion 装配，仅选入 `accountOnly:true`。匿名浏览器入口401，新的 legacy claim/目录410；原已经绑定的旧档仍按原 accountBinding reader读取，没有迁移或改写。默认可选参数保持历史局部authoring测试合同，正式 public明确关闭匿名与新认领。

退出或切号复用 identity epoch撤销请求；Main 清理旧world、面板、用量与动态纹理，加载回调按epoch/saveID检查。未知动作回执保存在原账号/旅程的pending；迟到响应不清掉或绑定另一账号，返回原账号重放同ID。运动、时间与动物保存算法未变；仅相应客户端夹具改为账号模式和显式选档，继续验证不确定结果恢复。

实际邮箱验证码成功尚需用户在原平台窗口自主完成；自动化仅打开/取消原shell，账号成功与切换使用清晰标记的本地隔离SQLite夹具，绝不注入正式身份或操作原存档。完整回归复用已经安装的 PG16.15，在本任务自己的127.0.0.1数据库运行与停止；无安装、购买、收费模型或媒体调用。

## 2026-10-09 固定已审核动物故事候选（以下旧章节保留历史）

本候选从正式前端 aba82cc 独立检出，现网后端 e59b2d4 保持。生产已是原 ECS PostgreSQL；后文早期“本地/未发布”描述是相应日期记录。当前候选尚未部署，不改现有账号 temporary-unverified 方案、存档归属、安全设置或迁移。

`server/content/reviewed-evening-gull-watch.json` 固定制作端已封存2次调用的安全消费字段。`reviewed-animal-life.ts` 验证 contractHash、独立审查绑定、事实编译结果和 content ref/hash，再将该定义追加到原 registry；不复用制作端 artifact/head/binding，不创建 proposal pipeline、网关或模型路由。`reviewedAnimalRegistry(false)` 只止新加入的故事，原内置委托仍启用，旧页 reader 保留。

`life-assembly.ts` 仅接受可选 registry；`exploration-assembly.ts` 接受可选 createLife，保持 e59 的 motionWait 与全部原时钟/空间装配。`public.ts` 只将同一个 createReviewedAnimalLife 接入原装配，plants/native-crab/B2/basil/mint/news 仍只包装一次；没有新 authority、数据库DDL、第二 writer 或收费调用。现有 Main/View 的通用 AnimalInteraction/AnimalPages 消费新 DTO，src/public/worker/vendor/package/lock 的生产字节保持基线。

验收使用已修正的本地 fixture 与独立 SQLite：原普通命令完成两观察、NPC结算、数据库重开和同ID重放的2/2证据保留，不冒称本轮再次执行。新界面验收只读取未介绍、可选择与已有册页，业务 action 阻断，仅允许原时钟初始化/移动通道；三尺寸中英9状态和定向事实合同测试，无 AI/媒体调用。初期 harness 错误（非法旧作物fixture、误拦时钟初始化、图片解码/异步面板等待）均保留报告，不放宽规则换通过。新玩家理解、真实手机、完整正式委托流程与最终发布仍分别列明状态。

## 1. 技术栈

TypeScript、React 18、Vite 8（`base: './'`）。场景使用 RPGJS 5 beta34、CanvasEngine 2.2、PixiJS 8；没有每帧 Canvas2D 拼地面。Node 24 的本地权威服务使用当前技能导出的 async Story Session 测试候选和 SQLite。规则扩展由冻结 compiler、delta verifier 与本机 SWI-Prolog 验证。

这是可玩的本地制作版本。匿名能力只用于本地预览，不是平台账号认证；没有把 SQLite 测试驱动宣称为 PostgreSQL 生产服务。尚未发布、未登记平台目录。

## 2. 目录结构

- `src/world/`：20 个作者地点、2 个有条件扩展地点、地形、脚点碰撞、门、纹理与 RPGJS 装配。
- `src/engine/`：技能空间合同、距离步态、地图手势、前景柔和揭示。
- `src/story/`：双语 Cartridge、确定性任务、物品、关系、介绍与话题退休、空间绑定、待提交意图和存档客户端。
- `src/combat/`：不依赖镇名/UI/图片的固定步进战斗内核、三种遭遇配置；`src/challenges/`：钓鱼规则。
- `src/ui/`：战斗、钓鱼、地图、摇杆、统一图标；`src/main.tsx`：HUD、渐进对话、行囊、手记、修理与地图拼图。
- `server/`：同 UUID API、权威适配器、平台对话、动态线索与媒体旁路。
- `vendor/dynamic-runtime/`：技能冻结导出，版本与 SHA 见 `doc/runtime-upgrade.json`，没有修改其源文件。
- `public/art`、`public/map`、`public/audio`：运行素材；`doc/art`、`doc/audio`：原始平台请求、来源、哈希与处理记录。
- `_qa/`：独立测试和真实渲染诊断；诊断页面只在开发环境开放，不进入产品构建。

## 3. 核心模块

### 世界和输入

五个大室外枢纽（车站街、港口、市场街、海岸、山坡）各约 1280×880 世界单位；另有七处室外子地点与八处室内地点。主角和 NPC 可见高统一 56。大型场景由相机跟随，不整体缩成一张房间总览。水域阻挡从最上层地形分区导出；家具只挡实际落地部分。

门通过靠近、行动按钮、明确前往进入，不自动开门。室内北/南墙立面高 64、侧边盖厚 8；南墙与南门在角色接近时局部渐变揭示。地板、北墙、侧墙、南墙为独立缓存层。此有限地图关闭 RPGJS 默认点位区块 streaming，避免地面原点离玩家过远时整块消失。未来真正流式世界须改为按视觉范围准入，而非直接照搬此开关。

移动采用碰撞后实际位移推进四相步态；画面与 UI 不共享逐帧 React 更新。键盘、地面寻路、圆形触控摇杆共用移动规则。场景已做纹理裁紧与按显示尺寸处理，原素材不被覆盖；尚无真实 iPhone 长时间性能证明。

### 权威、恢复与对话

浏览器加载同 UUID `/api`；唯一持久写入者是 Story Session。每次意图先落本地 session 隔离日志，再携稳定 ID 提交；未知结果重试同 ID，随后读取最新 head，防止旧回执倒退进度。版本冲突、重复奖励、异主读取、事务回滚、重启后的回执重放均有测试。

NPC 首次接近只显示日常描述；正式介绍后才可问话和使用名字。固定话题一次性退场，服务入口可重复，谈话进入手记。自由输入先过人物、距离、版本与用量门禁；模型选合法话题时执行原动作，不能靠正文发奖励。阅读文字先出现，玩家明确翻完当前回复后才显示下一组选项；不再使用计时器自动放出选项，也不点击正文跳过。

### 战斗与小游戏

战斗 60Hz 固定规则步进，UI 记录压缩输入；服务端重放计算输赢，不能直接提交“胜利”。覆盖击败对手、绕障碍到达区域、坚持 20 秒三种模板；出招预备/有效/恢复、单次命中、闪避窗口、弹道与障碍 LOS 可配置。全部为可随时退出的练习。钓鱼为 30Hz 张力控制，同样重放；修灯和拼图提交精确解法。

### 动态线索与媒体

琼只在玩家已查看小桥并借到工具后提供线索。最多两代补充地点；每代一处、两条有先后的观察。平台生成候选 → 结构检查 → compiler/Prolog 检验与语义复核 → 同一权威 head 采纳。只能写补充知识，不发物品、不改主线、不过度承诺无限世界。地点的几何和安全出口预先存在；进入时细节图可继续生成，失败不阻断线索。

媒体请求先持久化稳定 UUID、提示词，结果走 `putMedia` 旁路，不推进故事 version/cursor。检查归属、格式、字节上限和 SHA。新运行时图片是补充特写，不冒充已经生成新正交场景和碰撞。模型语义审查曾放过重复内容及不存在的在场说话者；项目增加题材约束与人工内容检查，不能据此声称通用语义审查可靠。

### 声音与语言

地点音乐交叉淡入，练习另有音乐；脚步由真实距离触发，门、出手、成果有音效。一个 AudioContext、最多四个事件音，切后台暂停、静音持久化。平台音频原件保留，数值音量/削峰/淡出处理见 `doc/audio/mastering.json`；听感仍需人验证。

默认系统语言 zh/en，菜单可覆盖；同一故事始终是北美虚构海湾，中文不改写人物或货币。双语导出共享身份。Cartridge 的地图连线描述不能脱离空间适配器独立执行；近距离、道具、路线门禁仍由适配器确认。

## 4. 扩展点

- 新地点：修改 `world/data.ts` 与 `outdoors.ts`，导出共享布局，重装地图，验证脚点路径及实际连续转场。
- 新故事：修改 `story/state.ts`、描述与 Cartridge，保持固定 ID 和旧档语义；不得仅在 UI 增加不可执行选项。
- 新遭遇：复用 `combat/core.ts`，在 `presets.ts` 配置，加入权威绑定与 UI；提交可重放输入。
- 新美术：平台服务生成新根图/同批派生，记录来源与处理，经过真实角色相邻与动作循环检查再准入。
- 正式后台：`server/public.ts` 为新 PG 接头，`scripts/migrate-public.ts` 负责显式迁移，`server/http.ts` 共用业务路由；`server/index.ts` 继续只作为本地 SQLite authoring 入口。`worker/index.js` 验证来源并签发绑定游戏 UUID 的能力 cookie。这个临时浏览器身份方案尚待用户接受，不是平台账号验证；真实 PG 运行和恢复尚未验收。
- 发布：`scripts/prepare-public-deploy.ts` 将私有绑定写到仓库外 staging，`.github/workflows/deploy.yml` 构建同提交镜像。`src/ui/Mirror.tsx` 在 Pages 上引导到主站，不向原游戏后台发跨域存档请求。完整状态见 `doc/release-readiness.md`；不能把适配代码存在等同于已上线。

### 2026-10-01 阅读与前期引导修订

`src/story/dialogue-reading.ts` 按句子生成中英短页，并保存 `exchangeId/page/locale/finished`。缓存经 storage adapter 隔离部署，再按权威旅程 UUID 与人物分区；从已提交 history 恢复，不提交 action。切语言从同一回复第一页开始。finished 标记防止同一历史回执重新唤起已读回复，缓存不代表跨设备阅读状态或真实账号认证。

`client.ts` 在拿到对话回执时先登记阅读缓存；未知结果用原 action_id 恢复，成功后只清除与该问题相同的草稿。UI 草稿使用旅程/人物 key。存在 pending 时禁发新动作，并提供直接重新连接按钮。离开人物窗口会递增 UI epoch，迟到结果仍采纳权威进度，但不强行改回旧人物窗口。

初次 AI 体验成功由权威 `free-dialogue-experienced` 标记或旧档实际问答记录判断；点击邀请、输入问题、失败都不算完成。固定话题 ID 未变；桥的具体追问要求已检查桥，庭院开放时间要求已讨论住户需要，模型与按钮共用 availableTopics。

开场从两页改三页，分别解释来历、住宿目标、操作。开场 UI 游标按旅程存储。正文、自由提问入口、可编辑示例与下一步话题均有中英版本。账号现状和旧技能证据见 account-storage-integration.md；本批没有新增凭据、部署或真实账号验证完成声明。

### 2026-10-01 室外道路与像素 UI

`src/world/outdoors.ts` 的 `passages` 将出口、接近点、路标和方向统一；`data.ts`把它映射为已有portal ID，并装配独立路标。路面延伸与水域碰撞继续从同一layout导出。`View.tsx`只在190单位内显示路标目的地，65单位内转为底部行动；点击不会直接提交travel。`Map.tsx`同步区域地点方位。

`src/ui/pixel-theme.css`在基础样式之后加载，用CSS变量定义字体/颜色/边框。面板flex布局保持标题与关闭按钮固定，正文内部滚动；选项自动换行。字体位于public/fonts，notices脚本保留完整许可证。世界高度按实际可用视口/1.3计算，取消520单位上限，避免长屏角色被额外放大。

素材重做流程：平台media-batch生成 → scripts/prepare-outdoor-refresh.py处理七件素材 → export-world.ts导出布局 → assemble-maps.py重装缓存地图。新的草地只含材质，树、椅和路标仍是独立有脚点的精灵；处理脚本不修改几何透视。主prepare-art保留新增素材的metadata。准入状态与全套前后对照见doc/qa/outdoor-ui-20261001.md。DEV-only压力页位于_qa/ui-stress.html，不连接账号或写存档，不进入生产构建。

室内追加使用同一处理脚本的可选manifest参数：`python scripts/prepare-outdoor-refresh.py doc/art/interior-refresh-20261001.json`。`Prop.floorDecoration`仅用于无碰撞的平面地毯：独立源图等比装入base层，sheets/View不创建对应Y排序事件，防止遮住脚部。八个作者室内新增用途匹配的陈设，原任务entity ID/坐标保持。

### 场景陈设与朝向元数据（10月1日）
`src/world/dressing.ts` 在基础布置后应用地点专用物件，人物、门和剧情实体身份不变。方向资产各自携带世界尺寸与地面碰撞。`scripts/catalog-refresh.py` 从实际布局汇总来源与朝向家族，输出项目级记录，不是共享库。地形按世界坐标对齐纹理，离线合成缓存底图。


## 2026-10-01 · 空间使用逻辑第三轮

src/world/scene-use.ts在dressHarbor之后组织用途分区；move同步移动精灵锚点和footprint，type同步重算素材尺寸与接地范围。dailyUseSpaces提供10个可站立且从出生点可达的使用侧测试。scripts/export-world.ts和assemble-maps.py重导出地图。来源与使用比例见art/use-logic-catalog-20261001.json，验收见qa/use-logic-20261001.md。


## 2026-10-01 · 植物层次第四轮

src/world/planting.ts在organizeDailyLife之后添加/替换植物；_qa/planting.test.ts按outdoors最终地形层检查落地。植物来源与当前比例见art/plant-catalog-20261001.json；验收见qa/plant-refresh-20261001.md。


## 章节回顾补充 · 2026-10-02

`src/story/chapter.ts`从权威market-open和route-choice标记生成只读回顾；`src/ui/ChapterReview.tsx`呈现，本作main.tsx提供菜单/告示入口和固定继续探索按钮。open-route首次权威提交冻结route-choice，旧档不臆测历史选择。`_qa/chapter-completion.test.ts`完整走三种合法路线，检查回执重放、数据库重开、角色隔离和后续修桥不改原决定；可显式输出不含真实玩家的QA布局夹具。


## 发布运行环境（2026-10-02）
前端仍Node24构建；服务端用esbuild目标Node22，冻结vendor目录作为外部模块原样携带，避免Prolog resolver路径和CLI入口判定因打包变化。实际服务器Node22.22.2/SWI10.0.2/Pillow，非root容器，独立harbor_game/kit_harbor，运行角色无DDL。平台同UUID Worker以私有绑定访问海湾专用HTTPS路径；现有预算保护保持，无新购。账号暂为明确获准browser capability，30日cookie在bootstrap续期，非AlterU账号认证。

## 2026-10-03 B：受限动态素材验证

新增 server/dynamic-assets：现有浏览器能力身份与两个新 QA 旅程白名单绑定；五个同 UUID 动作；只读 inventory catalog → 精确用途/视角/几何筛选 → 共享 selector → 固定 grant。PG 同事务提交 packages/grants 与 async_media 附件，不推进剧情游标。元数据只接受三个精确 @2；无新生图。默认 off，QA 文件到期关闭；普通玩家/旧档没有附加对象。前端 src/dynamic-assets 经逐字节与授权检查后整组挂载 RPGJS；三个预审槽位的碰撞由同一 layout 合同供应，图片不可改变几何。实际远程验收状态以本轮 release 回执为准，不能把本地测试说成平台账号接入。

## 2026-10-04 上下文举例

`src/story/question-examples.ts` 从现有Save和questProgress选择只读双语候选，缺少已知上下文时给泛问；不依赖新schema。`src/ui/ExampleAssist.tsx`管理轮换/预览/明确替换，接受受控value/onChange、inputId、locale、disabled；父组件以包含相关上下文与候选的key重置临时状态并沿用draftKey持久化。示例只写草稿，ask/send仍走既有权威链。角色/动作/生成房间是否需要例子取决于是否实际存在自由输入。扩展人物内容在game-owned适配器内完成，不能只按known角色推断所有知识已公开。移动端面板遮罩仅对直接按在背景的pointer-down关闭，防止打开面板的尾随click误关。定向证据见doc/qa/examples-20261004。

## 2026-10-04 居民与统一游戏时间（本地候选）
- `src/world/residents.ts`：一个权威存档分钟、旧档默认、单调推进/睡眠、时段、四居民路线、活动、受限散步位置和蕨苗阶段；不读取现实时间。
- `src/story/resident-life.ts`：兴趣→追问→邀请→时段相聚→回忆；稳定话题flag、一次关系影响。原9NPC新增生活话题；无新主线锁。
- `state.ts`在唯一行动提交中推进travel 20分钟、nap 180分钟、sleep到下一个09:00；自由阅读/模型回答不推进。`fernStartedAt`只写一次，阶段为纯派生。`runtime.ts`验证可选字段，SQLite/原PG存储序列化合同不另增第二写入者。
- `View.tsx`保留单个RPGJS实例；注册所有已作者化日程事件，缺席清空graphic且不占动态碰撞；活动时移动脚点共用于碰撞/热点/接近/提交。走廊内移动是本地环境表现，提交脚点须通过规则走廊准入，非服务器逐帧NPC模拟。
- `dialogue-context.ts`提供已提交兴趣/相聚/关系；`question-examples.ts`只读当前可见/已知事实，示例不消耗模型。本地QA注入固定回复，不调用外部AI。
- `_qa/residents-server.ts`仅127.0.0.1:5258，合成玩家和隔离SQLite；`_qa/residents.vite.ts`仅5257。不会修改原5234/5236服务。测试页面仍是真实App与RPGJS。
- 扩展：日程在residentRoutes添加，话题在resident-life增加；植物按相同权威分钟导出，不加独立timer。生产账号接线属于另一个候选，本批保留正式版browser-capability边界。

### 已知日程与抵达估算
`src/story/resident-guide.ts`集中管理日程话题、known+talk:routine双条件、当前/下一时段说明与visited快捷前往的+20分钟估算。`resident-life.ts`的一次性routine话题写原有对话历史；`main.tsx`手记仅设置mapFocus；`ui/Map.tsx`显示目的地提醒，保留原visited/busy/current可用性规则。无新计时器、存档写入者或地图解锁。`_qa/resident-guide.test.ts`覆盖4组规则；浏览器`_qa/run-resident-guide.mjs`覆盖5组，使用真实本地SQLite和合成玩家、固定模型回复，禁止外部请求；不代表平台账号或真实模型通过。


## 2026-10-04 最终居民美术集成

最终美术通过 residentPeople.art → NPC sheet/关系页肖像消费；植物通过 sheets.ts 的三阶段图形 id 消费。时间/约会权威模型沿用居民分支，关系 UI 不写入虚构亲密度。该批不依赖账号 PG 接入。

## 2026-10-04 本地生活模块

- `src/story/crops.ts`：数据驱动三作物、湿润时间、阶段、买卖选项和原子状态变更。Save新增可选`plots`；缺省空，不修改已有fernStartedAt。每块菜畦保存crop/grown/updatedAt/wetUntil，以提交的townMinutes结算，现实离线不推进。
- `src/story/fatigue.ts`：可选awakeMinutes，整数小时阈值按差值结算，拆分多个10分钟动作与一个长动作同结果。旅行/田间劳动增加，休息重置/减少。
- `src/world/residents.ts`：13人三时段路线，夜间休息；玛拉工具袋归还前停留车站。人物位置、互动准入、NPC碰撞共用配置。三时段之间是在下一次权威时间推进时切换场景，不宣称连续跨地图步行。
- `src/story/town-news.ts`：单条已核实官方信息的固定本地样例，无运行时网络请求。新闻ID/version事实，与虚构Casey/丹妮分支分开。独立flags持久化参与、核对、婉拒和回顾。已核对便条在山坡花园出现，使用现有noticeboard素材。未来正式采集器、审核、TTL/更正传播仍未实现。
- `server/runtime.ts`：兼容旧Save并验证可选新字段。所有作物/金钱/剧情动作继续走既有AsyncSessionAuthority版本与幂等事务。前端不独立写plots或cash。
- `_qa/townlife-server.ts`/`townlife-vite.mjs`：仅127.0.0.1:5267/5266、合成玩家SQLite、本地回复、无模型与媒体调用。不是正式PG或账号测试。

## 2026-10-04 本地RSS适配层（尚未生产启用）

- `server/news/collector.mjs` 固定美联储货币政策RSS、HTTPS+TLS、公网IPv4绑定、禁止重定向、10秒/512KiB、无XML外部实体。原子文件写入+独占锁；canonical URL+标题/description hash去重；记录原发布日期、首次抓取、最近核对、72小时缓存/30天发布时效上限。失败不写新catalog。同URL变化追加revision并暂缓选用；不推断它一定是事实纠错，缺项也不当作来源撤回。
- `scripts/collect-news-once.mjs --once` 只手动运行，写`.data/news/catalog.json`，不建立服务或排程。不读取页面图片，不调用模型。
- `server/news/runtime.ts:withNewsRuntime` 只在本地QA显式接线，给新旅程选择一条当时有效来源；旧存档不静默替换。原authority事务保存edition和剧情选择。`projectNews`是只读状态投影，不改事件版本；正常游戏API的可选`newsProject`未在正式public入口启用。
- 来源变化或找不到已固定版本：停止新的相关选择；单纯到期阻止开始新故事，已开始虚构故事可继续。已发生选择保留原来源snapshot。RSS未反映的正文更正不可检测，真实生产内容审核/更正传播仍需补足，不能宣称覆盖全部外部更正。
- `_qa/news-server.ts`、`_qa/news-vite.mjs`只绑定5271/5270，`HARBOR_LOCAL_NEWS_CATALOG`明确选择本地catalog。合成测试路径与真实采集输出分开，87回归测试，320/390浏览器验收；没有模型、PG、ECS写入。


## 2026-10-05 本地验证增量：资讯与作物

仅独立候选、无部署。账号证据见doc/qa/account-pg-20261005（账号候选）；真实资讯证据见doc/qa/real-news-20261005、作物接入缺件见doc/crop-library-20261005（资讯候选）。不混淆账号验真、PG隔离、资讯模板与素材实际可用状态。未涉及另一候选的功能不标为本候选已集成。


## 2026-10-05 作物12图集成（本地验收）
`world/crop-art.json`固定12图、来源hash、每物种共享缩放与根部anchor；`crop-art.ts`首次解码强洋红透明并缓存data URL，原图不改。`sheets.ts`注册9阶段和原程序化土床标记；`View.tsx`将plots纳入latest ref、按plot key更新三个RPGJS事件，深度与主角共用空间引擎。仅状态变化setGraphic；没有逐帧图片加工或第二生长时钟。`ui/CropImage.tsx`将3产物以同一透明适配显示在原背包。菜畦移至道路右侧630/700/770,630，approach由原object生成；原plot ID不变、无新碰撞，现有存档位置仍合法。源码保留c3558b07训练销毁/恢复修复。回归与来源见doc/qa/crops-integrated-20261005/README.md；未部署，不包含账号及下一批6居民分支。

返回以同步 ref 防重并立即冻结模拟/输入；真实 authority 确认后卸载。请求结果不明时，继续通过现有 pending 请求 ID/connect 恢复；不创建第二次奖励请求。挑战期间停发世界 checkpoint，刷新保留服务器 activeChallenge 并要求重新显式开始。规则、确定性回放和服务器奖励不变。


## 2026-10-05 新增6位居民本地候选

明确范围、人物表、规则、82项回归与6条浏览器流程、素材待交付边界见`doc/qa/residents-next6-20261005/PLAN.md`和`README.md`。19人候选只在本地验证，原c3558b07线上保持。人物计划不等于合格美术，临时图不进入发布验收。

## 2026-10-05 新闻／19居民／回合制本地整合（当前状态，以本节为准）

基于发布3295fbd建立隔离工作副本，保留账号、12张作物图与c3558b07即时训练修复。a28eb286的六位居民功能按文件合入，冲突处同时保留news/crops/nextTopics；不是以旧分支覆盖当前发布源码。旧文档中“13人／未接账号／作物未交付”是历史阶段，不代表此整合版。

- `server/news/configured.ts`：可选`HARBOR_NEWS_CATALOG`读取<=512KiB冻结JSON，校验后每进程固定快照；`public.ts`与账号transport传递同一runtime和只读newsProject。未设置则原行为保留，不自动抓取。新旅程初始化及旧未读旅程第一次留言行动固定版本；旧已读故事不替换。创建、读、行动和checkpoint的响应都投影当前可用状态，版本不因此变化。更换来源快照需重启服务，未建立自动更正传播。
- `src/story/next-residents.json`、`next-neighbors.ts`：6人作息、独立三步故事、双结局、回顾、关系，合计19人。新6人artStatus保持QA临时复用素材，未宣称美术发布通过。
- `src/turn-combat/core.ts`：确定性单人对单人规则，意图、出招、防守、反击、恢复、补给、轮数上限。没有身份、金钱或小镇依赖；还不是通用多人/队伍系统。
- `src/story/turn-battle.ts`：海湾准入、旧奖励共用、点心、暂停/恢复、游戏时钟、首次报酬与满钱包延领。可选turnBattle保存固定schema/config、实例、phase和逐轮日志。server/runtime在读取和行动处验证；原authority的幂等和CAS为唯一写入者，未改数据库DDL和线上旧档。
- `src/ui/TurnBattle.tsx`：普通React面板覆盖保留的RPGJS地图；不创建/销毁Pixi应用。输入确认后展示结果，暂停允许世界继续；重读沿原pending意图恢复。c3558b07旧Combat纹理销毁合同保留。新动作通过state/binding受服务端验证，客户端不传伤害或胜利。
- 暂停局阻止另开小游戏，但不阻止居民、种植、旅行和休息；双方本场状态与小镇体力分开。新补给仅packed-snack，作物和任务物不作为战斗消耗品。
- 本地测试入口`_qa/next-batch-server.ts`、`_qa/next-batch-vite.mjs`只监听5331/5330。可在`/qa/start`创建合成测试旅程；不应部署QA服务。免费问答使用本地固定回复，不调用模型。

证据与限制见`doc/qa/next-batch-20261005/README.md`。未发布，未新增付费生成，未变更生产账号存档；临时前端ID身份的既有安全局限不变。

## 2026-10-06 本地收口增量

`src/main.tsx`保留封存的柜台描述去重修复，并区分菜单即时切磋和回合练习说明；`src/ui/TurnBattle.tsx`首屏使用短指引，展开区保留归零和回拳馆续局说明。无新规则、数据库DDL、身份合同或新闻采集器。`_qa/news-configured.test.ts`注入测试时钟证明到期前1毫秒可开始、准确到期阻止未读、已开始可继续完成，同一冻结文件和日期不变。

本轮以12ef2cf为固定基础，增量patch包含原先未提交的柜台修复一次，不能再叠加旧patch。12项新闻/回合定向测试与1项HTTP账号新闻测试通过；历史137项仅为交接证据，不重复宣称为新整批结果。Vite构建、UI静态检查、公开凭据和API路径检查通过。普通浏览器本地fixture不证明Telegram账号绑定；详情、可复现基础和限制见`qa/takeover-closeout-20261006/README.md`。


### 2026-10-06 本地后续差量
本地next-batch QA明确采用doc/qa/real-news-rechecked-20261006/catalog.json；仅更新同一事实核对/有效期，首次抓取及原发布时间保持。生产仍是显式HARBOR_NEWS_CATALOG opt-in。Rowan.mapArt独立绑定合格动作图集；资料图art仍为显式QA占位，完整UI消费图未准入。详情doc/qa/rowan-local-integration-20261006/README.md。未发布。

### 2026-10-06 组件分别消费，五地图/十二资料图
nextPeople现在分别转发art（既有root-v2肖像路径）、avatarArt（关系列表256方头像）、mapArt（NPC图集）。六人art/avatarArt绑定独立身份；五人mapArt绑定独立图集，Mira.mapArt沿旧占位，避免资料通过导致请求不存在的地图PNG。原13人fallback不变。NPC anchor[.5,122/128]、scale56/108、偏移0/0和16 phase/方向合同保留；英雄8/12偏移不抄给NPC。17消费PNG源/候选/dist SHA及57固定原件映射核对，11项居民/关系测试和最终build通过。当前仅本地合成账号UI，无iPhone或正式平台本批验证。

## 2026-10-06 五居民／新闻／回合发布候选（覆盖前述本地六人状态）
`nextResidents`只将五位已准入居民投影为 playable people/routes/topics，18人总数。Mira JSON及既有存档known/关系/历史/事实原样保留，dialogueContext和spatialSnapshot只投影当前存在人物，未做迁移或删除。暂停回合、作物与旧新闻pin在真实SQLite重开、CAS和重放下验证。冻结复核目录完整复制至server/news/frozen-catalog-20261006.json，bundler复制到dist-server/news，部署明确设HARBOR_NEWS_CATALOG；无采集器。最后复核2026-10-05T18:59:16.076Z，到期2026-10-08T18:59:16.076Z，原发布2026-09-16T18:00:00.000Z。release marker=harbor-five-news-turn-20261006，同源health新增sourceRelease。具体验证与实际部署状态见releases/five-news-turn-20261006/README.md，不能将候选构建当线上成功。

## 2026-10-06 动物一期本地接线（基于已发布19人10c0983）

本段覆盖此前18人／Mira待接入的历史描述。当前发布基线19人，动物改动只在 `codex/animals-integration-20261006` 独立工作树开发，未上线，未修改正式存档或身份合同。

- `src/animals/`：制作方8模块原样接入；新增 `art.ts` 固定两图集／40方向帧来源并共同筛选启用个体，`game.ts` 从当前 rooms、19名 residentRoutes、游戏时间及 dynamicWorld 构建场景ctx和互动准入。3猫／4鸥，狗只是独立算法夹具，蟹未实现。
- transient运动复用单一createAnimalRuntime，真实RPGJS帧驱动步态／地面避让／翼拍／落地。主角、居民和动物共享场景足点：客户端读取实际NPC脚点，权威端保守保留居民合法巡游走廊，避免将未持久化位置误作可信服务端事实。动物原子投影统一图形、地面碰撞与热点；flight只上移graphic，排序仍用地面foot。
- `world/data.ts`只为已准入个体加入object实体；不加入people、known或人物关系。`binding.ts`先做同一动物互动准入，再以可信slot中已验证的actorPosition偏移进行原spatialBinding距离检查，无豁免整个动物类别。
- Save可选 `animalsV1`，读取时缺字段保持原样，非法schema、未知catID、非法熟悉度或未来抚摸时刻拒绝。call/pet仅在原authority.prepare→CAS→head/history/cursor/receipt事务写入，没有新的数据库、DDL、后台计时器或AI调用。原时间、现金、物品、居民关系、新闻pin与战斗状态保留；熟悉度0–3，每日首次pet最多+1。
- Main传持久动物记忆给View，只有服务器回执成功才触发短时注意反馈，熟悉猫标签取自保存结果。map touch仅approach，动物44px以上触控目标随当前foot同步；同一目标位置变化仍刷新near。scene/journey/读档reset暂态，clock提交reconcile；暂停dt0，旧档重叠只移动动物。
- 两PNG保持制作方SHA和锚点／等比scale0.5，不在消费端重画或变形。候选art.json的technical accepted限定为本作本地集成开发的消费合同；制作方审核v2、通用库runtime/libraryEligible=false和权利／profile待核状态另存原件，不转写为正式上架。正式发布仍需主端审阅本批差量／验收与剩余门禁。

本地QA服务 `_qa/animals-owner-server.ts` 仅回环5425、独立SQLite合成旅程，5424开发预览与5426固定dist预览；均不可部署。验证日志与原始失败/修复记录在 `doc/qa/animals-integration-20261006/`。真实MiniApp新闻／回合QA仍按独立合同等待用户正常打开，不由动物改动替代。真实iPhone、跨设备、第二真实账号与玩家理解没有新增证明。

## 2026-10-06 科技数字游民独立实现与本地验接（基于动物提交 f6e6be82）

本节是独立副本增量，不改上述发布记录。配置及本地准入总数均22；新3人的`artAdmission`已由唯一集成owner在最终消费字节、原renderer、日程、资料UI及权利验收后设为accepted，missing为空。线上仍19人，本候选未发布。

- 技术栈和运行方式保持 React/TypeScript/Vite、RPGJS/Pixi、既有 AsyncSessionAuthority 与 SQLite/PG 适配器；无新服务、模型、网络采集或数据库DDL。
- `src/world/tech-nomads.json` 保存3人固定身份、24h半开时间段、9个业务脚点、双语文案、职业观点、故事两选项和固定美术准入/SHA。`tech-nomads.ts` 投影角色/路线，依据唯一游戏分钟解析活动、专注婉拒、下一可聊时间和美术准入。未认识伙伴的名字在活动、日程提示和上下文中替换为邻居。
- `src/story/tech-nomads.ts` 使用独立 `nomads-v1-*` 话题和故事flag，不修改 B1 life 模块或 `neighbors2`。Save仅增可选 `techNomadsV1:{schema:1,stories:{[id]:{choice,completedAt,recalledAt?}}}`；旧字段缺省不初始化、不迁移或清空。故事要求既有 introduction 和伙伴生活事实；选择互斥、本人及伙伴各+1关系，60游戏分钟后可回忆一次且不再奖励。只保存真实话题/个人选择，不创建B1尚未挂载的收藏物。
- `state.ts` 复用 existing topic/action 提交；`binding.ts` 登记动作但仍验证当前人物/场景/距离；`runtime.ts` 验证可选记忆并在专注时直接提交已作者化婉拒，保留提问历史，不调用 resolver、不误标一次自由AI对话体验。版本、幂等、CAS、owner隔离和receipt仍由原authority事务负责。
- `data.ts` 增配置实体，`sheets.ts` 只为美术已准入者注册图集；`View.tsx`、故事动作和 `animals/game.ts` 共用 `presentEntity`。pending、夜间和不在当前场景时图形/热点/居民碰撞同时缺席。三人使用原NPC锚点、等比缩放、24单位巡游和原遮挡排序；没有另一renderer或改主角偏移。
- `relationships.ts`、`resident-guide.ts`、`question-examples.ts` 和 `server/dialogue-context.ts` 复用现有关系、手记、历史与问答入口。关系不依赖临时UI状态；日程提示只在认识且学习routine后开放。`newsStory` 仅保存冻结来源准入要求和拟议模板；无已准入科技文章、无当日新闻断言，不接入旧经济资讯的采集或来源pin。

扩展点：调日程/职业观点/故事文字/脚点修改 `world/tech-nomads.json`；调故事前提、关系和回访修改 `story/tech-nomads.ts`；未来真实科技来源由owner先完成原来源审核及固定版本后另接模板。本次已核对3类实际PNG尺寸与SHA及原renderer后更新`artAdmission`；以后替换仍不能只改status绕过证据。

确定性验证入口 `_qa/run-tech-nomads-offline.mjs`；三居民两分支两语言、1440分钟日程、旧档、SQLite重开/重放/CAS、未来22人动态几何与3猫4鸥见 `_qa/tech-nomads.test.ts`。`_qa/tech-nomads-pending-browser.ts` 只拦截读取独立dist和合成旧Save，不监听端口，外网全部abort；320×568/390×844双语验证原19人、猫、移动、关系历史和pending缺席。该pending浏览器脚本是制作前历史夹具，不代表当前准入状态。当前`_qa/tech-nomads-owner-browser.ts`对真实Main/View/RPGJS构建、实际handler和隔离SQLite跑12故事/资料完整流程与18日程视图；仅合成旧档，不监听端口、外网abort、无正式身份。37文件176/176离线及23针对性检查通过。三人`portraitShape:square`只调整这些人的contain尺寸，原19人规则保持。只读美术审计`scripts/audit-tech-nomads-art.mjs`应报告本地PASS；平台/手机/SiteUI/新玩家理解、本候选PG与HTTP listener仍未验证，详见`qa/tech-nomads-owner-20261006/README.md`。

## 2026-10-06 镜头修复候选（正式 2e1e20e 的局部增量）

本节只记录该本地候选，前文早期制作/发布状态不代表当前正式版本。本轮没有修改服务、存档、碰撞、时间、日程或经济。

- `src/engine/exploration-camera.ts`：纯呈现几何。输入已有视觉矩形、逻辑可走矩形、视口世界尺寸、CSS 安全遮挡与等比缩放；输出脚点 anchor 和覆盖所有原边缘所需的额外 render bounds。12px 为最小间隔，86px 为当前完整人物帧的头部预算；原 hero 图集 alpha 高 108 / 128，对应世界 56、标准手机显示 72.8px。
- `src/world/exploration-layout.ts`：从实际 header/location/objective/controls 读矩形，写入标题/地点底边 CSS 变量。ResizeObserver 与 childList MutationObserver 处理布局变化；镜头求解前同步重测，防止字体或操作文案变化后读上一帧尺寸。共享 guest-shell 永不作为 HUD 测量对象。
- `src/engine/rpg-space.ts`：保留 `cameraBounds(scene)`，新增 `cameraWalkBounds(scene)`、`cameraSafeArea()`、`cameraBackdrop(scene)`。视口最底层 `TilingSprite` 复用已存在地面纹理与 160 单位平铺相位；无需新增美术或大尺寸纹理。暂停 RPGJS 默认 follow / 初始 animate 插件，避免另一个中心跟随覆盖安全 anchor；即时相机跟随、实际映射与逆映射共用同一个 viewport。
- `src/world/View.tsx`：只接上述接口、加载现有底材、钳制就近门户标签；昼夜、人物、动物、农畦、前景揭示与权威行为保留。

宿主缩小 iframe 的情况由真实子视口自然触发 resize；`env(safe-area-inset-top/bottom)` 继续进入游戏 HUD 和操作区。仓库中未发现可供该子 frame 使用的 Aigram 父覆盖高度消息合同，因此没有臆造 postMessage、query 或固定宿主高度。本地 host fixture 仅验证“缩小 iframe + 明确 CSS safe inset”这条接线，真实 Telegram/物理手机和未传 inset 的父覆盖仍 unverified。

后续连续地图应传偏移合成后的可走矩形与视觉画布；碰撞/窄接缝仍属于各自规则模块。不得整份覆盖 View、回退正式昼夜，或借本增量合入 B2/头像/动物候选。

## 2026-10-07 B2与原动物首切片局部组合

server/life-assembly.ts统一plants＋existing-animal包装，public.ts及独立QA使用同一工厂。lifeProject追加animals；原account transport守卫、authority CAS/receipt与存档格式保留。src/life/use-life-snapshot.ts以身份epoch/scope和lifeSnapshotKey隔离响应，校验LifeView版本/游标/分钟及animals版本。key覆盖known和notebook/sample的实际内容。本轮是动作时钟，尚未接运动回执。

src/animal-life/presentation.ts只读过滤过期sample；UI及View使用当前实时玩家点，服务端投影使用持久化点，读取不会续期。record仍重算原动物帧与邻近条件。相机/daylight/engine及依赖锁文件与正式d644逐字节一致；View只局部组合B2事件、选择覆盖层与现有动物帧，不新增第二相机或认证。


# 2026-10-07 罗勒局部装配（当前代码）

## 1. 技术栈
复用固定5bca React/TypeScript/Vite8/RPGJS/Pixi与同一authority，依赖未变。独立本地测试SQLite；public默认未启用罗勒，另交一份2处变化的显式激活补丁。

## 2. 目录结构
server/plant-basil.ts包裹现有createHarborLife的结果，不再创建plants/animals；plant-uses-rules.ts与src/life/plant-uses.ts保留623固定定义和严格旧记录解释。src/ui/PlantUsesPanel.tsx只含罗勒需求/订单，Main仅局部调用；snapshot.ts补plantUsesV1依赖。_qa/plant-basil*为规则/HTTP/本地普通UIfixture。

## 3. 核心模块
withBasilPlantUses(assembly,{enabled,newStarts})沿原runtime、life/land/animalProject和authority。默认罗勒可由显式wrapper启用，薄荷所有命令拒绝；旧mint状态只读保留。enabled=false阻止新前提/接单/回顾，但已接单可交或关闭；newStarts=false同样止新，旧版本crop与seed不变。无payload新plant-use动作按实际scene/居民/75px binding验证；movingClock存在时新动作同样拒绝未确认>4px的脚点。新增成功动作清掉旧animal sample，不续期旧proof。版本/cursor/history由原事务提交，失败不改head。

投影附加plantUses但保留原animal/plant/land字段；UI失配禁提交。时钟场景调用者可传真实projection.current，不能伪造snapshotVersion。7f9中外层withActivePlayRuntime必须包新用途runtime以先结算时间，再校验营业/截止。有限依赖和有限业务错误的C适配另交，未覆盖owner变化中的Main。

## 4. 扩展点
在最新owner组合上局部装配wrapper，按C接缝复验时间/动物；不要重复包B2。B仅可选本地wild mint fixture，默认false、正式素材仍HOLD。既有留种沿原规则，批次新配额尚未实施。所有生成/生产/发布由另授权与唯一owner流程处理。


## 2026-10-07 人物关系成长 v1.0（独立候选）
1. 技术栈：沿用React/TypeScript/Vite、RPGJS空间渲染、Story Session权威事务，无新依赖。
2. 目录结构：`story/relationship-growth.ts`为可选schema1、阶段、三位作者profile与纯读投影；state/binding接入原动作；`server/relationship-narrative.ts`仅受限句子候选；Relationships详情与原实体面板呈现记忆/观察；新增relationship-growth测试、loopback服务器与UI脚本。
3. 核心模块：只读upgrade不迁移，首次合法动作原子添加relationshipsV1。旧数值/支线/暂缓人物和其它模块字段保留。已有工具袋/听歌进入历史证据，不补日期或奖励；迁移后才完成原支线时，recordRelationshipStory在原事务镜像完成事实和实际分钟，legacy快照不被覆写，原奖励仍只结算一次。createRuntime第三参数可注入已提交head的分钟，禁止额外计时源。schema/rules严格拒绝未知版本；阶段即时推导，AI候选没有effects。原身份epoch/旅程隔离/pending重放沿用，音频/相机/地图不改。
4. 扩展点：加居民需relationshipProfiles独立作者内容、已有身份/日程与真实物件接缝；调阶段改relationshipStage同时新rules版本；候选文案在profile或narrative准入句子中；其它系统share通过其原事务接入，不能加第二包装器或再发奖励。完整迁移与B2/地图验收见relationship-growth-20261007.md。本地SQLite/合成账号/桌面手机尺寸不替代正式PG、平台账号/实机和发布。


## 2026-10-07 独立消费者与AI结构约束
本轮基于生产6bcf74e6cbc328c16c14d93add68142898e8487c的公开源码ce6944b756efe8ed0ff0f7453673d5c82141cbbd独立检出；前文早期本地/未发布描述属于历史记录，当前游戏已由唯一owner发布。本分支没有部署或库写入。运行使用既有Node22依赖，不改锁包/vendor/凭据。
`src/animals/native-crab-profile.ts`固定四向扫掠面；`native-crab.ts`复用距离运动核，提供旁移、限幅退避、受阻等待和只读诊断观察，不能注册生产物种或发proof。`native-crab-art.ts`提供完整RPGJS sheet与隐藏状态，`native-crab-manifest.json`和public元数据逐字一致，九源来源/SHA/统一处理均固定。`spatial.ts`仅新增共享clearance helper及类型收窄，不改既有猫鸥路径行为。
`_qa/crab-c1.html`为dev-only诊断，`_qa/crab-c1-view.ts`使用本基线真实RPGJS/Pixi/连续空间适配器和地图；仅本地fixture确认移动，原动态动物引擎和居民走道保留。`_qa/animal-stand-space-geometry.json`重新实测23套人物（含主角）、2套动物和112件道具，另保留海鸥完整作息与飞行区域；不会用alpha包络代替蟹地面扫掠面。几何sidecar和QA元数据不进入产品bundle。
`server/animal-grounding.ts`为确定性事实编译器，逐个体精确校验period/scene/activity，拒绝自由title/brief/page/effect/reward/proof字段；`server/animal-proposals.ts`仅test environment可用，继续原builder/gateway/CAS/artifact固定hash/同ID重放。已采用旧定义按原hash读取，不静默改写；关闭newStarts仍能读取旧定义。审查最大8条、每条300字符，超限不截断也不采用。没有新增production路由或真实模型调用。
扩展时先改作者profile/原生素材manifest并复验所有帧/岸图；新的物种能力需工程实现，不能改AI描述绕过准入。正式蟹authority观察、存档启用、库登记与生产发布需唯一集成/库owner显式接入；本补丁维持productionEnabled=false且旧档拒绝蟹动物记忆。

## 2026-10-07 UI 首期独立改造（基线3b09a9b，未发布）

### 1. 技术栈
沿正式React/TypeScript/Vite8与RPGJS/Pixi、英中轻量tx和原Story Session客户端。使用现有Node22.22.2、依赖和Chromium测试；无新增软件/依赖、后台、schema、权限、付费机制、图像/模型调用或运行时API。base仍`./`，UUID API base、alteru存储adapter与iOS长按guard保留。历史章节的“候选/未启用”等措辞属于当时记录；本次正式输入以owner的3b09a9b及09:35双部署封存回执为准，已有罗勒、自然时钟、B2猫鸥和关系成长。

### 2. 目录结构
- `src/main.tsx`：四主入口、面板/次类/来源返回栈、各页滚动快照、目标到事情的跳转、旅程加载清理。既有动作、身份epoch、挑战和自然时钟暂停继续在原App接缝执行。
- `src/ui/Bag.tsx`：Goods/Records/Keepsakes与物品列表、单一实物计数、分类/搜索/详情、操作结果和断线恢复。`bagRows`为纯读取模型，投影失配时不暴露消费动作；投影暂失时按保存的lifeV1 lots保留批次数量。
- `src/ui/Matters.tsx`：复用作者化relationshipStory稳定ID、成长next、已有订单、农畦/线索和暂停对练。共享事项汇总一份，现场要求保持。
- `src/ui/Journeys.tsx`、`src/story/client.ts`：正常游玩目录读取、新建确认及切换；只使用已有sessions API，普通browser management上下文仍受当前bound/scope/pending守卫。
- `src/ui/navigation.css`、`icons.tsx`、`Relationships.tsx`、`Map.tsx`：原像素系统的布局/SVG/局部控件，真实相机仍读取既有DOM安全区，无另一相机。
- `_qa/ui-*`：仅合成账号、任务自有临时SQLite与独立浏览器；报告、截图和固定guest-shell响应放在本任务根evidence，不使用真实档。

### 3. 核心模块
导航层保存主页面/人物/地点/次类/scroll，来源返回恢复原状态；旅程ID变化清空导航、背包选择及临时投影。世界入口和面板入口是一套地图/人物/行囊/系统。人物有认识的人/事情/回忆，地图有地点/探索，系统有我的旅程/设置/操作帮助。记忆读取原完整history，不再自动生成重复情境摘要。

BagState提升到App以保存分类、搜索和选择。rows稳定按类型及固定ID排序；view batch拥有作物库存权威，替代root crop/seed计数，纪念物只读已有实物数量。0份结果可继续读，不产生虚假库存。少量物品不显示搜索，超过12项才显示；手机选择器/桌面按钮共用状态。读失败后已升级存档的lifeV1批次与旧未升级items分别读取，不迁移或改写。未知旧批次保持只读身份，不猜物品名。

物品操作只复用原留种、点心、照片和动物册取消；播种/出售/交货/分享保留原地点及服务端binding。当前请求busy与未确认pending分开：pending锁住新消耗，空闲后显示同一请求的重连，connect仍重放原action_id。数量投影须匹配head再开放批次操作。不定回包的新旅程保留原enrollment_id直到完整connect确认，新建不删除或覆盖任何旧档。切换前flush既有movement；活动挑战、锁定回合和pending阻止换档。账号目录沿原身份，browser possession不冒称离线或跨设备账号；旧browser档不会自动认领。

所有新显示文案用现有tx，国际故事与美元保持；音频仍summerAudio，成功事件沿原动作回执，不增音效。全局guest-shell及adapter不改。测试只对任务临时服务读写，公开扩展响应固定取样加载，其他外网阻断；无真实Telegram/生产PG验收声明。

### 4. 扩展点与整合边界
调入口/来源返回改main；调背包类型、排序或数量读取改Bag的纯模型；调尺寸/颜色改navigation.css；新增事情必须来自已存在的作者化投影，不能在UI发奖励或解锁。第二期命名/删除/覆盖须另立服务端合同与明确确认，当前不提供按钮或假API。owner最新原生蟹等变更与main/docs存在同文件冲突时按精确diff人工合并，不能整树覆盖；AnimalNotebook新物种投影按其owner类型继续消费，不回退其服务或renderer。

本切片尚未发布。接入后应在唯一owner当前HEAD重跑编译、合成账号新建/切换/重放、完整罗勒与关系/时钟组合，再由既有独立Telegram任务确认宿主安全区与真实身份。浏览器合成证明可执行，理解仍unverified。

## 正式 b24 最小 UI 拆分

本候选直接以 b24ff51149a2b8c34782991765aa90f557c0994e 为唯一 parent；从 a797 选择菜单 Map／Bag／icons／focus／CSS，并剔除 f9 薄荷消费、狗、道路与 AI v5 依赖。server、world、life、animals、worker、账号／存档、package/lock 与原图保持 b24 字节。bag-art 按 id/revision/hash/capability 固定消费八份独立派生，动作继续走原有命令；焦点与阅读状态仅为本地呈现。部署门禁独立保留，未上线。

## b24ff51 三项收尾准备（独立候选，未发布）

`src/animals/behavior.ts`仅狗follow分支增加暂停时owner-away及96上限停止；`dog-admission.ts`准备12格/9独立源和原生动作家族门禁，不改acceptedAnimals或正式名册。

`src/life/plant-uses.ts`保留逐字legacyMintNode@1、新增草地@2；`plant-uses-rules.ts`同时读取两hash，旧记录不改写，旧版停止新增观察/采集但归档/分享沿原来源。`server/wild-mint.ts`消费一次已有罗勒life装配，默认返回原对象，显式开启但缺合格图直接拒绝；public.ts未挂载。`wild-mint-art.ts`真实素材为null，Main/View/叶片行囊只增加受门禁约束的消费接缝；不创建假的sprite/hotspot。

`road-boundaries.ts`从实际outdoors顶层patch生成只读材质并集边界，不按每块矩形描边；consumer-spec.json记录全部场景计划/图集cell规格。尚未用缺失图覆盖正式地图。

本轮31项规则/旧档/SQLite、原岸蟹3项及三尺寸6组编译Main关闭态通过；另3组新草地root UI验证。首次监听EPERM在限定loopback批准下仅重跑受影响测试；测试坐标比较曾漏市场540显示偏移，修正harness而未改时间或游戏坐标。免费范围生成POST/发布/素材库写入/真实玩家操作均0。费用清单见任务根ART-ORDER.json；新批16 POST上限尚待用户一次确认，单价/总额未知。


## Native 三项收尾候选 · b24ff51

native-dog独立模块采用52×34占地和51×46显示包络。可选profile/displayClear保持默认七动物结果；原蟹geometry pins不变。View增加狗事件/邻区隐藏，预测区变化先隐藏狗再等原场景回执；withWildMint包装最终withBasil一次，缺图显式拒绝，@1/@2旧记录可读。canonical approach不变，renderer靠近点改为494,708。九个单区map-base及实际market-bazaar合成底图只重组地面纹理，碰撞/portal/地块/时间/菜单/冻结新闻不改。恢复时先暂停等待原异步移动回执落盘，再检查head，不用过早head伪判回读失败。关闭薄荷新开始保留新版reader，不回滚数据库。完整源/hash/请求/实际QA在native-consumer-spec与owner live交付。



## 2026-10-08 菜单、地图与行囊候选

独立候选继承正式 b24 → 已封存 f9 狗/薄荷/道路；此增量只改 Main 菜单接线、Map/Bag、同一套导航 SVG 和 UI 样式，不改认证、服务器、作物/动物/时间规则、名册或旧存档。动物 AI v5 另行只读接收，未混入本 UI 提交。

地图普通滚轮保留页面滚动，不再与地图缩放同时触发。固定「地点/探索」放在 panel body 外；地图自身仍被 body 正常裁剪。触摸默认 pan-y，显式「拖动地图」切换 map-only pointer/pinch；缩放按钮/全图仍可用。地图区域、选中地点和 view 存在当前 App ref，切换入口恢复；切换 journey 清空，不写存档。地图地点选择不再改变 Places 的 scroll key，同根入口重复点击保持当前位置。

行囊/人物分类随各自正文正常滚动，桌面详情只在 body 内吸附，避免旧分类栏叠盖列表。

主面板和放大图采用可逆 DOM inert、最上层焦点循环与原 opener 回焦。Escape 在输入框中生效，先关放大图；滚动列表/关闭用 click。地图拖动才捕获 pointer，普通触摸不捕获。没有增加业务 writer。

行囊数量仍由原固定批次和物理物品 DTO 负责，未创建第二库存。batchArt 对 id/revision/hash/capability 精确匹配，未知旧版不借用最新版。复用九张实际对应游戏图，确定性包含完整前景/照片；派生与源 SHA 位于 src/ui/bag-art.json。木板仅额外去除已看图确认且连通透明边的深紫底残留，原游戏源字节不变。不含对应美术的种子、钥匙、工具、鱼、点心、纪念卡继续文字标识，既没有通用图标冒充也没有新增生成。详情和列表同源；选择/返回有明确焦点；缺读/更新中禁用使用，薄荷归档现在 await 原请求并防止同轮连点。耗尽所选物品保留零数量和来源说明。

QA 位于 _qa/menu-bag-after.mts：编译后实际 Main/View/RPGJS + 隔离普通浏览器 possession cookie/SQLite，外部请求阻断。预置存档明确为合成，本轮观察、输入、留种/吃点心/归档仍走原 authority。初期测试脚本抢在 React/image effects 前读 DOM 的失败、滚轮指针落入固定栏、桌面隐藏 select 的定位失败保留在外部 evidence；最终矩阵必须以 report.json 为准。不存在本轮实机、Telegram、跨设备或生产发布证明。


# 天气第二阶段独立候选（基线58，2026-10-09）

## 技术栈

沿用原React/TypeScript、RPGJS/Pixi/Vite和权威Session/CAS、SQLite测试服务。无新依赖、生成、数据库表、定时任务或身份方式。

## 目录结构

`src/weather/ecology.ts`固定可选weatherEcologyV1规则、当前分钟激活、每日额度。`server/weather-ecology.ts`只帮助原生v2已恢复中的野薄荷，原v1 hash保持。`src/weather/state.ts`扩展原紧凑weather回执：只传新策略和recoverAt减量，不携带库存、订单或历史。`src/weather/animal-shelter.ts`集中声明已有树冠/合法走廊，renderer与服务端cat动作共享。`src/weather/resident-reactions.ts`保存六位居民双语反应与露天停步条件。规则与实际页面脚本为`_qa/weather-ecology.test.ts`和`_qa/weather-ecology-ui.mts`。

## 核心模块

`createWeatherSettlement({ecology:true})`才允许新策略；生产入口public.ts未启用此开关。读不迁移，旧档首次已确认动作从当下固定策略，无离线补算。原weatherV1与五床每天60分钟额度未改。薄荷额外恢复最多每实际雨分钟1分钟、每游戏日60分钟，严格保留节点hash、来源、stock、叶子数量和原720下界；若本动作新采集而改变期限，动作前区间不记给新采集。active与motion同原事务/CAS提交，重放不重算。

猫只在原昼间日程场景内寻路到已有树冠脚点；原world、树干、门、地块、玩家、居民、其他动物仍阻挡。目标不可达时留在安全原位，不把附近任意脚点称为避雨。每分钟确认在同一时段/场景保留当前足点及路径，雨止通过同一有界走廊返回；正常时段换场优先原日程。夜间原睡眠/禁抚摸/观察不改。狗、蟹、海鸥保持。旧动物观察frame按原sample合同重算，既有册页与收藏不迁移；雨天昼间猫不准采样晒太阳，UI与server同时拒用。猫的既有每天一次抚摸仍沿原动作规则。没有新增动物奖励。

六位已介绍居民的可见描述追加当前天气反应，未认识的人不泄露身份；原日程/服务准入/关系记忆保持。自由对白context只增加当前已确认天气与规则事实，没有发模型请求。设置、菜单、相机、连续地图、昼夜与时间系统未重做。

## 扩展点及回退

启用只需在审核后的组合入口显式开启ecology，不能直接拿本地fixture当正式登录验收。新策略一旦被正式写入，回退必须保留本候选reader、settlement、compact delta和已减少的期限；关闭ecology/newStarts只能阻止新增pin，不恢复旧期限或DB快照。第一阶段1fbb790兼容回退不含本策略，不能在第二阶段暴露后直接使用。未来新规则/素材必须另版本，不能原地改pin。后续雨后发现、收藏线索与AI故事仍开放规划；真实模型调用需另有预算，不能借ECS或素材库额度。

## 2026-10-09 · b12发布后第三阶段本地架构准备

前述“生产未启用”描述a245历史状态；b12已启用并双发布，兼容关闭890不回58。正常平台账号玩法仍未验。第三阶段仅本地模块，public.ts、Save schema、前端、存档delta、资讯和原clock不变。

`server/after-rain-evidence.ts`的afterRainFacts复用assertWeatherReadable、原固定weatherAt和参数pin，通过周期算术得到最近已结束雨段；雨段计算O(1)，不扫历史。事实ID由旅程范围、固定参数、政策激活分钟和雨段SHA形成；版本独立，重复读取稳定、异旅程不能复用。只在原outdoor场景、当前雨后阴天slot、实际pin之后有经过雨分钟时返回。旧档/雨中/室内/已过窗口返回null，无新增head字段。

已有薄荷线索复用原assertPlantUsesReadable/ContentRegistry/mintStatus和mintDefinitionHash，最多一条。只有nativev2已观察且可再访才带原节点/scene/geometry；不改stock/leaves/期限/来源，不迁移v1或注册素材。admitAfterRainDraft只接受有限topic/tone、当前版本/factID、effects=[]；确定性双语说明不冒充AI生成。

prepareAfterRainDialogue是默认关闭的localFixture-only dry adapter。调用方提供原最终authority的admission callback，不重造身份、world、空间或时钟；本地fixture实用admitSpatialAction+validateQuestion证明已有登场、近距、版本/scene准入。复用dialogueContext并structuredClone再冻结，原residentLife/relationshipNarrative/currentObjective/dated news保留，单独追加confirmed-game-weather来源。没有调用原gateway、配置、数据库、模型或生成API。public.ts没有导入模块，不能把这些测试写成已完成真实authority事务/正式对话验收。

下一接缝：用完整最终assembly的spatialContext/prepare链验证B2/moving transport和pending重放，再做明确独立SQLite/PG、真实Main收藏/对话页面；保持唯一原authority、原builder/gateway和预算。未来新观察记录必须固定版本与稳定receipt id并在原CAS事务幂等保存，不能让模型正文自行记录观察/给物品。真实AI服务、调用上限、费用需要独立具体批准；本批paidCalls=0，原冻结news日期/hash不变。
## 天气第三阶段本地集成（2026-10-09，未发布）

基线为正式 b12，继承 b6 的只读事实计算。`server/after-rain-runtime.ts` 将有限雨段事实和六位原居民的双语视角投影为 `afterRain`，通过原 `server/runtime.ts` 的 `weather-after-rain` 动作写一条普通 talk history。准入借用原 ask 的已认识、在场、近距、场景、挑战守卫，并保留原 movement、B2、pending、CAS 与前台时间包装器。没有第二 writer 或新增 Save 字段。

动作 payload 精确为 schema/factId/topic/tone/effects 五项，effects 必须为空；expected_version 沿原 action 验证。雨段 ID 绑定旅程、参数、policy 激活点与原游戏分钟，过期不补算离线，也不把恢复后的薄荷全归功于雨。原 v1 薄荷读取保留，不借 v2 线索。

`createExplorationAssembly` 的 `afterRain` 默认为 false，候选 `server/public.ts` 显式开启；它没有被本轮执行。b6 的 `afterRainRuntimeEnabled=false` 仍表示其独立 dry adapter 关闭，不是新集成的开关。生产文件没有读取或复制本机私有配置。旧 b12 实际 reader 可读新增普通历史，关闭新入口不需要恢复数据库或迁移存档；仍须保留 b12 的天气生态 reader。

`server/dialogue.ts` 在原上下文后追加有界天气证据，保留生活、关系、任务和有日期新闻，原模型 gateway 与计费策略不变。本轮真实模型调用为零；本地注入 planner/transport spy 不是 AI 生成证据。规则回应没有 question 字段，不设置 `free-dialogue-experienced`，UI 也明确其来源。

`src/ui/AfterRain.tsx` 沿原人物交互与人物→回忆呈现。`lifeProjectionKey` 纳入天气 pin，避免同分钟政策变化复用旧投影。投影未核实、busy、pending 时沿原流程禁用。原收藏、采叶、订单、菜单、昼夜、相机、素材、身份和自然时间不变。

有限用户操作错误必须由 `server/active-business-failure.ts` 明确列入409终态集合。本次实际Main发现失效fact被503包装后原pending无法结束，现已修复；存档损坏、policy drift、基础设施错误继续503非终态，保留原请求。320实际本地HTTP拒绝后经原关闭/重开、用户再次选择，只有新明确请求保存一次回应；回包丢失重放则沿原同一请求复用。

验证与复跑说明见 `doc/weather-stage3-integration-20261009.md`。正常平台登录、手机/Telegram、跨设备、真实AI回答和新玩家理解未验收，不能据本地合成旅程推定已通过。候选尚无发布授权，不上传后端、不推送镜像、不修改玩家原档。


### 教堂本地扩展（未发布）
`src/story/chapel.ts`只消费权威flags/分钟/known；实体动作走原applyAction/空间绑定/唯一authority的CAS与回执。新的有限玩法错误加入active-business-failure，unsupported保存仍保留请求待恢复。旧档不自动补参与，新增事实缺省为空。世界声明由chapel-layout加入，`_qa/export-chapel-layout.ts`从实际World导出，`scripts/assemble-chapel.py`只构建新场景四层和带实际碰撞的TMX，不重烘焙其他地图。Pillow沿已安装x86_64 Python运行，无安装。
复用动物7c89d8c中的renderer module-instance/disposal修复为独立共享依赖，未引入动物AI host；owner组合时保留一次，不整份覆盖其他Main/View变化。QA环回5590→5591使用合成内存authority，外网被浏览器harness阻断、无生产身份/存档。真实生产/PostgreSQL/平台证据须独立验接，不能继承本地通过。


## 2026-10-10 天气四五期 owner 整合候选

客户端weather/storm.ts以有效原pin和townMinutes导出rainProfileForSave，不新增保存字段；weather/scene-masks.ts仅投影美术排除区。现有后台、package/lock/public、业务规则保持391字节。完整合同见weather-owner-391/INTEGRATION.md；本轮尚未发布。


## 2026-10-15 Gabriel R2 消费锁（本地未发布）

从4451隔离接入4份既有PNG，固定character-family__gabriel/revision2/record44125733-66b7-4952-9f6a-a508a926ae30。只更新avatar crop、portraitShape与contain、provenance/artStatus及真实Gabriel十二帧视觉reservation；后者曾误指Arthur，保留原alpha>200/root64,122/scale56÷108公式。狗蟹及其余geometry逐字段不变，ground collision、日程、NPC动画、authority和Save schema不改。消费锁更正R2辅助镜像6项旧SHA；实际像素和整格镜像有效，canonical record本轮未改。28项相关测试、构建和8组实际本地Main/64受控frame核验通过；未写私库、未调用生成、未部署/推送。完整证据边界与复跑命令见doc/qa/gabriel-r2-integration-20261015/README.md。

# 2026-10-15 土地二期本地候选（实际代码）

## 1. 技术栈
沿4451b92 React/TypeScript/Vite8/RPGJS/Pixi及同一Story Session/账号/clock/weather组合。依赖未安装或升级，复用既有Node22.22.2和共享node_modules。正式后端基线由协调线程给定9585；本轮只在内存/临时SQLite合成数据验证，不连接正式PG。

## 2. 目录结构
src/life/land-contract.ts集中两/四槽上限和ID；land.ts定义schema1原档、显式schema2扩地凭据、预览及确认/收回。life-{b2,plants-b2,runtime}.ts沿原host/authority做真实位置与命令准入。src/life/{save,seed-quota,rules}.ts扩大新槽可读/种植及最多7个在种来源，原采收配额规则与refs不改。src/weather/state.ts以已扩容量验证最多7个雨水计数，compact delta仍不能凭空加植株/ref。

LandPanel/LandPreviewPanel消费真实预览，保留加载/陈旧态、显式扩地与空畦二次确认。src/life/land-selection.ts让暂停中的点选只生成4单位格预览，不行走或推进时间；View保留原镜头/日夜/地图，仅将土畦和作物槽扩为固定1–4并调用该输入合同。Bag中脆荚种子定位实际已访问种植地点，原三种仍去花园；原每株/每批次留种命令不改。

_qa/land-phase2*含真实规则、SQLite CAS/重启、现行4000ms自然时钟、账号HTTP处理器进程内调用与React静态呈现检查。REVIEW.html为合成只读组件预览，不是实际Main/renderer或功能性应用。

## 3. 核心模块
只有显式expand-land将landV1从schema1升级schema2，记录revision/sourceAction/minute及保留原permission/plot；两地许可和先前两畦由权威验证。新菜畦仍geometryRevision1、48×24footprint及原保护/可达规则，第三/第四槽必须绑定已扩土地。clear-bed禁止有植株；删空畦不删许可、容量、采收来源或雨水计数，不退款。全部原子候选由原CAS/receipt提交；读不会升级。仅新schema2在life读取时校验土地扩展，原schema1模块读合同保持，完整runtime仍验证原土地。

createLifeB2第五参数options.expansionStarts=false停止新扩容和编号3/4的新分配；原1/2槽与已有植物照料/收成/留种保持，schema2读取不能回退删除。createLifePlantsB2第三参数可透传此选项；现行装配沿默认值，独立关闭默认补丁供owner评审。

新客户端请求携带公开能力头X-Harbor-Land:2。新HTTP处理器对已扩schema2旅程的会话/生活/土地读取及新的扩地/收回动作要求该头；旧两畦旅程仍服务旧客户端。写通道保持原CAS/版本检查，不插入额外数据库事务改变模糊提交结果。缺头时返回CLIENT_REFRESH_REQUIRED、terminal:false，保留待确认请求及真实head。新前端遇旧预览会保持原两畦；life投影的landPhase2能力缺失时不展示收回。此头是格式能力声明，不是身份、授权或凭据，所有动作仍按原账号/空间/版本/资源验证。

自然时间先于土地/营业/收成结算，失败不提交自然分钟。新增有限业务拒绝409，未知/坏档仍503可重读。雨水每畦每天默认60分钟，不增加手浇标记、种子、腐败或死亡。

## 4. 扩展点
容量/稳定ID只在land-contract调，新增土地需独立几何及真实renderer验收；新物种仍走原不可变registry及资产准入，不由本包开放AI自动加机制。新增动作要同时维护parse/host/rules/错误/投影/UI与回执测试。前后端迁移以4451前端、9585后端逐文件对照补丁为依据；不能整份覆盖owner后续文件。schema2产生后保留新reader，优先止新和前向修复，不整库回档。

本地可评审，尚未实际浏览器/Telegram/手机/PG验证或部署：普通回环listen为EPERM，Chromium启动探针提前退出；依本任务不新增权限/安装，未升级。纯规则/进程内HTTP/SSR/构建结果不能改标为真实运行画面通过。

## 2026-10-15 HBQA-LAND-006 独立增量修复

独立 QA 在 e1d222c 的实际浏览器 → Worker → 合成后端路径发现：client.ts 已发送 X-Harbor-Land:2，但 worker/index.js 重建白名单请求头时未转发，扩地与已扩 schema2 的重新读取均返回409 CLIENT_REFRESH_REQUIRED。直接后端200不能作为入口通过证据，原反例继续有效。

本修复只让 Worker 转发精确值2；缺失、未知或合并值仍不转发。不自动给旧客户端补能力、不修改身份/来源/私有边界、不删除 server/http.ts 的兼容读取保护，也不在写入前加数据库读或改变原 CAS/回执。公开格式能力声明与身份认证无关。Worker 和具备 schema2 reader 的后端须一起保留；不能在已产生 schema2 后回退到不能读取它的旧后端。

_qa/land-worker-chain.ts 执行真实 handleApi、verifiedEdgeOwner、账号 HTTP、正式 exploration assembly 与合成 SQLite；仅将上游网络传输接为进程内 Readable/Response，原 Worker 产生的头和 body 原样进入后端。fixture 默认不注入能力头。测试涵盖两/四畦读、显式扩地、同 ID 重放、不同 ID 竞争、提交后丢回包、SQLite 关闭重开、三/四槽收成留种和清空、缺头保护及跨账号隔离；另以实际 story/client.ts 在 Node 的合成宿主中检验 pending 保留、重连与投影。这是完整业务代理链证据，未覆盖浏览器渲染、TCP/TLS 或部署环境。

两个历史 signed-cookie 网关测试误设 temporary-unverified，却仍要求 bootstrap 签发浏览器 cookie；原 e1 同样失败。仅将这两个 fixture 的身份模式改为原有 browser-capability-v1，与测试目的匹配；不改变产品策略。新增链路测试使用正式当前的 temporary-unverified 模式。

独立候选与原始反例的清单、进程状态、回归日志及尚待 QA 的真实按钮/刷新验收见外层 QA-HANDOFF.md。官方 Chrome 启动与回环 listen 在当前沙箱均受阻，未提权、安装或接管用户窗口；HBQA-LAND-006 尚待独立浏览器 QA 关闭，HBQA-LOAD-005 由其原 owner 处理。

## 2026-10-15 Owen关系后续切片（本地候选）

1. 技术栈：沿用React/TypeScript/Vite与原Story Session权威事务，Node24合成SQLite测试；无依赖安装、模型调用或新后台。
2. 目录结构：`src/story/relationship-expansion-profiles.ts`仅Owen作者profile；`relationship-growth.ts`复用原阶段、动作、问候、约定与记忆投影，按居民路由存储；`_qa/relationship-expansion-fixture.ts`为合成分钟与正常reducer路径；`.test.ts`覆盖规则/原子/旧版本/组合；`.mjs`只生成实际React组件的离线内容评审，不启浏览器或HTTP端口。
3. 核心模块：三位原试点仍用`relationshipsV1` schema1 / relationships-v1.0，旧数值、动作、规则和根字段保留；Owen用可选`relationshipExpansionV1` schema1 / relationship-expansion-v1.0，严格名单仅owen，独立migratedAt。旧known/数值/鸟声话题读取不迁移，不补过去日期，不按高分晋级；第一次合法介绍/成长互动在同一CAS/receipt事务添加根。回滚4451不认识此字段，但实际冻结源码的reader/upgrade/原动作已测试保留它，新版再加载可继续，不恢复旧DB。lifeSnapshotKey与lifeProjectionKey都含扩展根；异步身份/旅程与内容失配仍禁用操作。自然时间由原exploration assembly先结算，关系只读提交分钟，沿原第四options参数合同，不加计时器。AI句子上下文使用本人的rules版本，仍不能选rg-*动作或修改阶段/奖励。
4. 扩展点：后续居民仍需独立作者profile、现有日程/真实物件与完整回归；此版本不称作用户批准的后续名单。加入其它居民时须明示新规则/兼容转换方案，不把Dani等名字静默塞入本版本存档名单。旧4451对该根是保留而不展示；它不提供新阶段操作。详细范围与测试状态见本任务目录HANDOFF，扩大回归的基线失败不在此补丁顺带修改。真实renderer 320/390、Telegram/实机与理解待现有QA窗口结束后验收。

## 2026-10-15 Samira目标冲突独立增量

1. 技术栈沿用，未新增依赖。唯一产品修改为`src/world/chapel-layout.ts`的chapel-seat交互at/approach下移30世界单位；renderer、人物位置、道具图、静态碰撞和权威存档结构保持。
2. `_qa/samira-approach.test.ts`从Git精确冻结4451、比较其与c9走位相关blob、验证旧/新静态世界完全相同、49当前巡游脚点、旧夹具碰撞终点、78条双版本绕行条件、原座席动作、旧三人/Owen保存及SQLite原子回放。条件采样不冒充独立UI用例。
3. `_qa/samira-target-replay.mjs`是给独立QA新host的模块。观察实际RPG玩家/人物与底部目标，先以Samira且可互动停止，才考虑走向保守航点；实际键盘与当前人物碰撞参与规划，禁止坐标注入/force。每次新时间戳/账号/旅程/证据，拒绝在原081701证据目录运行。回归范围含原接近点、原卡住坐标和门口三起点×390中文/320英文；正式HTTP/renderer结论只能由实际执行产生。
4. 本环境无增权条件下listen(0,127.0.0.1)返回EPERM，因此这里只执行几何/规则/SQLite合成与构建，不宣称浏览器补验通过。独立候选需QA重放再放行，不覆盖原c9或旧QA证据，不迁移/回滚真实档。


## 观赏蕨本地接缝（2026-10-19）

配置与纯规则：src/life/ornamental-fern-config.ts、ornamental-fern.ts；正式根ornamentalFernV1不接受旧fixture来源。server/ornamental-fern.ts只装配一次，处于既有活动时间／天气／权威事务内；createExplorationAssembly沿用原植物、动物、新闻装配。plantStarts=false关闭新赠礼，保留既有盆蕨读／移动。两个专用flags只投影holder并由strict reader核对；worldWithFlags给同一盆位投影碰撞，presentEntity在真实拥有后才揭示该实体。Main使用原面板／阅读恢复；Bag从正式根投影唯一物品，不复制items计数。fixture-only文件与历史测试保留未启用。
