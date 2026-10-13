# Telegram 进入耗时与切图双主角候选修复

基线前端 9a91916cd21f75e4e6d81c96a1497e990f9e8fc7。独立本机 checkout/分支，无正式发布、后台重启、迁移、真实存档操作、付费资源或权限配置修改。后端未更改。

## 进入耗时

已证代码瓶颈：首场景 prepare 串行等待地板、农作物准备、动物、主角和其他贴图；保留原资源集合，改为并行启动互不依赖的加载，农作物图片替换与后续贴图加载仍按依赖顺序执行。不修改超时、重试或身份校验。

同一实际 RPGJS renderer 的单轮隔离对照（用户 Mac，无头 Chromium，390×844，合成 hill 场景，外部请求全部阻止）：

|图片额外延迟|基线导航→ready|候选导航→ready|
|---|---:|---:|
|0ms|2315ms|1176ms|
|每次250ms|5146ms|4078ms|

候选分段记录：普通加载 scene-assets 141ms、renderer 720ms；延迟加载 scene-assets 2586ms、renderer 1178ms。scene-assets 在 renderer 内另被引擎调用一次（已缓存2/1ms），区间有重叠，不能直接相加。导航到 ready 包含脚本与引擎启动，但不是用户点击 Telegram 图标到首画面的全链路耗时。重复运行候选0ms为1879ms，说明单次对照有波动，不能当作稳定真机收益。

增加48条上限的内存诊断：host-identity（模块初始化后首次有效宿主身份）、bootstrap、session-directory、session-get、dynamic-assets、scene-assets、renderer，只有阶段名/起始毫秒/耗时/成功失败。连接详情可读取；不保存账号、URL、token、原始错误或浏览器存储。不增加远程上报。

会话合成回归模拟40ms身份延迟、各请求30ms延迟、GET失败后用户再次读取与二次进入；身份缺失时不发请求；失败仍明确失败；未添加自动写入或重试。正式环境身份桥接、后端响应与资源网络耗时尚未取得，不能断言它们不是其他瓶颈。

## 双主角

本机合成切图已复现。RPGJS standalone每张地图使用不同临时本地玩家编号；客户端map reset保留当前对象，随后收到新pId时又merge新对象，旧受控玩家未退役。hill→harbor→hill→station→hill→harbor→hill、快速连续切图后基线玩家对象与可见hero贴图均为2；刷新重新变为1。

最小修复在现有受版本锚点保护的编译兼容层：收到不同pId时，在切换前清理上一位受控玩家的动画/订阅并从players signal移除。保留其他对象，同编号不清理；不更改平台账号、权威存档或地图连接身份规则。

候选普通/250ms图片延迟、6次往返、快速返回、刷新均保持1个玩家对象、1个hero贴图、1个canvas，无pageerror。额外实际渲染回归检查退役对象的_harborSceneDisposed及tick subscription.closed全部为true。重载/关闭浏览器context用于隔离生命周期；尚未模拟真实Telegram宿主关闭返回。

## 验证与限制

- 类型检查通过；`npm run build -- --configLoader runner`通过。runner避免Vite向其他任务的共享只读依赖目录写临时配置。
- 15项针对性Node测试通过；实际renderer对照与退役订阅回归通过。
- 公开凭据扫描与diff空白检查通过。
- 合成截图和原始结果在工作区output/playwright/entry；精简证据见 `_qa/evidence/telegram-entry-20261013.json`。测试由 `_qa/entry-renderer-browser.mjs` + `qa-entry.config.ts` 驱动，基线构建需使用基线View，候选使用当前源码；该harness并非生产入口。
- 用户截图Library下载失败，未读到原图像素；仅保留用户/协调转述，未独立鉴别宿主。
- 未测：Telegram/iPhone真机、真实后端延迟、宿主关闭返回、真实延迟/重复动作ACK、动态生成房间故障与授权资源加载、其他设备尺寸。双主角已证明合成renderer根因与候选效果，不冒充用户真机复测。
- 正式部署仍需父协调取得用户批准；本任务没有发布权限。
