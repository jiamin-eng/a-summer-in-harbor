# A Summer in Harbor · 海湾新生活

一个普通人来到海湾小镇度过夏天的 2D 开放探索 RPG。五个室外地区、室内外共二十处作者地点、渐进式入住引导、街坊交谈、三条解决通行问题的路线，以及切磋、走位、垂钓、修理和拼图。

## 本地启动

需要 Node 24、SWI-Prolog（生成规则检查）、Python + Pillow（素材与动态图片检查）。

```sh
npm ci
npm run server
# 另一个终端
npm run dev
```

打开 http://127.0.0.1:5234/ 。最终构建试玩 http://localhost:5235/ （先运行 `npm run preview`），当前保留在新玩家序章。权威端口 5236；存档在 `.data/preview.sqlite`，不要删除它来“修复”问题。首次平台生成需要可用的 AlterU 平台媒体/对话服务。没有网络时固定探索和已有话题仍可使用，生成请求会明确报错。

`npm test` 验证规则与恢复，`npm run build` 产出便携 `dist/`；`npm run preview` 在 5235 预览构建，仍需要本地权威服务。

## 状态与证据

首章、室内外美术与像素 UI 已完成，主站部署及真实后台验证通过；平台列表入库状态见发布验收记录。不是多人世界或无限生成承诺。素材由平台服务新制，没有读旧游戏图片作为参考；同轮角色/门派生有明确记录。

已获上线授权，发布接头与镜像入口正在准备；已获批复用现有 ECS/PG 并暂用当前浏览器续玩，详见 [发布状态](doc/release-readiness.md) 和 [部署合同](deploy/README.md)。

- [需求](doc/requirements.md)、[视觉](doc/visual.md)、[技术](doc/technical.md)
- [验收与限制](doc/qa/acceptance.md)、[技能试用评估](doc/skill-evaluation.md)
- [第三方许可](public/THIRD_PARTY_NOTICES.txt)

默认英文或中文跟随系统；方向键/WASD、点地面或圆形摇杆移动，靠近后使用行动按钮；地图可缩放拖动并返回已到访地点。对話可选择话题或自由输入。

临时版本的旅程由当前浏览器/WebView 凭证持有。换设备不能自动恢复，同一浏览器切换 AlterU 账号也不会切换旅程；清除浏览器数据可能失去访问。平台真实账号绑定及持有权迁移是后续工作。

## MCP 服务器

`mcp-server/` 挂在本地权威服务上。`npm run server` 启动后，MCP 在 `http://127.0.0.1:5236/mcp`，读写 `.data/preview.sqlite` 里的同一份旅程。详见 [mcp-server/README.md](mcp-server/README.md)。

## 服务端构建

`node scripts/bundle-public.mjs` 生成 Linux 可用的 `dist-server/`（目标 Node22），不含私有配置。生产在既有 Node22/SWI 镜像的独立海湾层补充 Pillow；本地前端构建继续用 Node24。

正式主站：https://game.aiwaves.tech/e78df027-7ef4-4d49-82eb-ea91f03d9fb3/

前端镜像：https://yinxinghuan.github.io/a-summer-in-harbor/ （仅前端，开始旅程前往正式主站）
