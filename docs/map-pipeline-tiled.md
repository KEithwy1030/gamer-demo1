# Tiled 地图管线最小约定

本文是 `P1-E` 的最小对接说明，只定义 Tiled 侧的命名和对象语义，不改变当前运行时生成逻辑。

当前权威实现仍然是 `server/src/match-layout.ts` 里的 `buildMatchLayout()`；这里的 Tiled 约定是给后续导入器、关卡编辑和人工校对用的。

## 基本约定

- 地图尺寸：`4800 x 4800 px`
- 图块尺寸：`32 x 32 px`
- 坐标单位：Tiled 对象坐标直接按像素写入，和现有 `MatchLayout` 保持一致
- 原点：左上角 `(0, 0)`
- 现有 `match-layout` 字段：`templateId`、`squadSpawns`、`extractZones`、`chestZones`、`safeZones`、`riverHazards`、`safeCrossings`

## 推荐 Tiled 结构

建议使用 1 个地图文件和以下对象层：

- `meta`
- `squad_spawns`
- `safe_zones`
- `extract_zones`
- `chest_zones`
- `river_hazards`
- `safe_crossings`

图层名是约定，不要求和运行时字段同名，但建议保持一一对应。

## 对象映射

### `squad_spawns`

映射到 `MatchLayout.squadSpawns[]`。

- 对象类型：点或小矩形都可以，推荐点对象
- 必填属性：`squadId`, `facingX`, `facingY`, `safeRadius`, `deploymentLabel`
- 对应字段：
  - `squadId` -> `squadId`
  - 对象位置 -> `anchorX`, `anchorY`
  - `facingX` / `facingY` -> `facing`
  - `safeRadius` -> `safeRadius`
  - `deploymentLabel` -> `deploymentLabel`

### `safe_zones`

映射到 `MatchLayout.safeZones[]`。

- 必填属性：`squadId`, `radius`
- 对应字段：
  - 对象位置 -> `x`, `y`
  - `radius` -> `radius`
  - `squadId` -> `squadId`

### `extract_zones`

映射到 `MatchLayout.extractZones[]`。

- 推荐对象：圆形对象，或点对象 + `radius`
- 必填属性：`zoneId`, `openAtSec`, `channelDurationMs`, `radius`
- 对应字段：
  - 对象位置 -> `x`, `y`
  - `radius` -> `radius`
  - `zoneId` -> `zoneId`
  - `openAtSec` -> `openAtSec`
  - `channelDurationMs` -> `channelDurationMs`

### `chest_zones`

映射到 `MatchLayout.chestZones[]`。

- 推荐对象：点对象
- 必填属性：`chestId`, `lane`
- 可选属性：`squadId`
- 对应字段：
  - 对象位置 -> `x`, `y`
  - `chestId` -> `chestId`
  - `lane` -> `lane`，只允许 `starter` 或 `contested`
  - `squadId` -> `squadId`

### `river_hazards`

映射到 `MatchLayout.riverHazards[]`。

- 推荐对象：矩形对象
- 必填属性：`hazardId`, `damagePerTick`, `tickIntervalMs`
- 对应字段：
  - 对象位置和尺寸 -> `x`, `y`, `width`, `height`
  - `hazardId` -> `hazardId`
  - `damagePerTick` -> `damagePerTick`
  - `tickIntervalMs` -> `tickIntervalMs`

### `safe_crossings`

映射到 `MatchLayout.safeCrossings[]`。

- 推荐对象：矩形对象
- 必填属性：`crossingId`, `label`
- 对应字段：
  - 对象位置和尺寸 -> `x`, `y`, `width`, `height`
  - `crossingId` -> `crossingId`
  - `label` -> `label`

## 现有 `match-layout` 的对照关系

当前代码里的布局不是从 Tiled 读入，而是由 `server/src/match-layout.ts` 生成：

- `templateId` 仍由服务端模板随机选择，Tiled 侧可用 `meta.templateId` 作为人工校对标签
- `squadSpawns` 当前由环形模板生成，对应 Tiled 的 `squad_spawns`
- `extractZones` 当前只有一个中心撤离点，对应 Tiled 的 `extract_zones`
- `riverHazards` 当前由服务端预置河道带生成，对应 Tiled 的 `river_hazards`
- `safeCrossings` 当前由服务端预置安全过河点生成，对应 Tiled 的 `safe_crossings`
- `chestZones` 当前由服务端根据出生点和中线生成，对应 Tiled 的 `chest_zones`
- `safeZones` 当前由服务端根据出生锚点生成，对应 Tiled 的 `safe_zones`

## 最小样例文件

建议把示例放在：`client/public/assets/maps/match-layout-minimal.tmj`

这个样例只用于说明命名和属性，不要求被现有运行时直接加载。

## 约束

- 不把完整地图生成系统迁移到 Tiled
- 不改 `combat`、`lockAssist`、`InventoryPanel`
- 不把这个文档当成运行时规范替代品；真实执行仍以 `server/src/match-layout.ts` 为准
