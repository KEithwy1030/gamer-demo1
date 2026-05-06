# Dev Room Presets QA

这个入口是 dev/test-only hook，默认关闭。

## 启用方式

1. 启动 server 时显式带上 `ENABLE_TEST_HOOKS=1`。
2. 浏览器地址显式带上 query：`?devRoomPreset=boss|extract|inventory`。
3. 推荐把 client 绑定到 `http://localhost:5180`，server 绑定到 `http://127.0.0.1:3300`，避免页面 origin 和 API host 不一致。
4. 仍然通过正常大厅流程创建频道并点击“立即出征”。

只有同时满足上面条件时，preset 才会生效。

## 默认关闭

- 不带 `ENABLE_TEST_HOOKS=1` 时，server 完全按正常房间流程运行。
- 不带 `?devRoomPreset=...` 时，即使 server 开了 test hooks，也不会套用任何 preset。
- 正常内测 / 正式玩法流程无变化。

## 示例命令

### server

PowerShell:

```powershell
$env:ENABLE_TEST_HOOKS='1'
$env:PORT='3300'
$env:CLIENT_ORIGIN='http://localhost:5180,http://127.0.0.1:5180'
npm run dev:server
```

cmd:

```bat
set ENABLE_TEST_HOOKS=1
npm run dev:server
```

### client

```powershell
$env:VITE_SERVER_URL='http://127.0.0.1:3300'
npm run dev:client
```

### 浏览器 URL

- `http://localhost:5180/?devRoomPreset=boss`
- `http://localhost:5180/?devRoomPreset=extract`
- `http://localhost:5180/?devRoomPreset=inventory`

如果 `5180` 被占用，使用实际输出的端口，但 client 和 server 的 origin / base URL 仍然要保持同机同协议。

## Preset 用途

### boss

- 人类玩家开局落在 Boss 附近的安全截图距离。
- 用来验 Boss 外观、站位构图、技能 telegraph / FX。

### extract

- 人类玩家开局落在撤离区桥附近的可截图位置。
- 用来验毒河、桥、撤离圈、接近撤离区的场景构图。

### inventory

- 人类玩家开局附近会有可拾取掉落。
- 用来验局内拾取、背包展开、拖拽交互截图。

## 已有浏览器证据

- 页面快照：`.playwright-mcp/page-2026-05-05T22-59-11-582Z.yml`
  - 证据点：`boss` preset URL 下，正常大厅创建频道成功，主按钮切换为“立即出征”。
- 页面快照：`.playwright-mcp/page-2026-05-05T23-02-06-918Z.yml`
  - 证据点：已从大厅进入局内，页面出现局内背包面板，说明浏览器可用这条入口实际进图。
- 控制台日志：`.playwright-mcp/console-2026-05-05T22-51-18-775Z.log`
  - 证据点：Phaser 启动日志出现，未见 hook 相关前端运行时报错。

## 配套验证

- `npm run validate:dev-room-presets`
- `npm run build`
- `node scripts/test-loop.mjs`
