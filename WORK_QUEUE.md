# gamer-demo1 · WORK_QUEUE

版本：v2.0
用途：这是唯一执行清单。所有 Agent 都按这里推进。

---

## 总原则

- 一次只执行一张任务卡
- 每张任务卡都必须先列“会改 / 不会改 / 验收方式”
- 没有完成当前阶段，不得提前做下一阶段
- 所有跨 client/server 的变更，优先检查 shared

---

## Phase A · Baseline Audit（只分析，不改代码）

### 目标
把“当前代码真实行为”抽成一份基线，终止靠记忆开发。

### 输出物
- `docs/agent/CANONICAL_BASELINE.md`
- `docs/agent/DELTA_MATRIX.md`

### 必做
1. 读取并总结：
   - 根目录 workspace
   - client 入口
   - server 入口
   - shared 导出入口
   - scripts
   - docs/agent
2. 抽取当前真实运行参数：
   - 地图
   - 撤离
   - 背包
   - 武器
   - 怪物
   - 房间
3. 输出“规格 vs 代码”差异矩阵
4. 标出：
   - 必须先修的 P0
   - 可以后置的 P1
   - 视觉与游戏感相关的 P2

### 默认重点排查路径
- `client/src/scenes/**`
- `client/src/ui/**`
- `client/src/network/**`
- `server/src/**`
- `shared/src/**`
- `scripts/**`
- `docs/agent/**`

### 禁止
- 不允许改业务逻辑
- 不允许顺手修 bug
- 不允许顺手重构

### 完成定义
- 当前仓库“实际是什么”已经被写清楚
- 接下来所有人都不再靠 README 或口头描述猜参数

### 推荐执行者
- GPT-5.4

---

## Phase B · Shared Freeze（P0）

### 目标
冻结共享契约，清理最危险的漂移源。

### 必做
1. 确认 shared 的唯一入口方式
2. 清理 / 统一 client、server 对 shared 的消费方式
3. 检查并统一：
   - 事件名
   - payload 字段
   - 共享枚举
   - 全局常量
4. 清理测试或运行脚本里的过期硬编码参数
5. 让 Baseline 的关键参数有唯一来源

### 高优先检查点
- `shared/src/protocol/**`
- `shared/src/types/**`
- `shared/src/data/**`
- `client/src/network/**`
- `server/src/**`
- `scripts/**`

### 禁止
- 不做视觉优化
- 不新增玩法
- 不重做大厅或结果页样式

### 完成定义
- shared 成为唯一契约层
- build / typecheck 可过
- 关键参数不再多处硬编码复制

### 推荐执行者
- GPT-5.4

---

## Phase C · Core Loop Alignment（P0）

### 目标
把“搜 -> 打 -> 撤”的主链做成前后端一致、测试可读的闭环。

### 必做
1. 对齐房间 -> 开局 -> 同局 -> 战斗 -> 掉落 -> 拾取 -> 撤离 -> 结算 -> 回大厅
2. 对齐背包 / 掉落 / 装备 / 丢弃 / 使用的完整链路
3. 对齐死亡掉落规则
4. 对齐撤离触发方式、撤离反馈、中断规则
5. 对齐结果页与回大厅状态清理

### 建议先拆成 3 张小卡
- C1：Inventory / Loot / Equip
- C2：Death / Extract / Settlement
- C3：Return to Lobby / Replay

### 推荐检查路径
- `client/src/ui/**`
- `client/src/scenes/**`
- `client/src/results/**`
- `server/src/inventory/**`
- `server/src/loot/**`
- `server/src/extract/**`
- `server/src/combat/**`
- `shared/src/types/**`

### 禁止
- 不做大面积视觉改版
- 不扩展 Demo 2 内容

### 完成定义
- 主链从开局到回大厅可以完整跑通
- UI 看到的状态与服务端真实状态一致

### 推荐执行者
- GPT-5.4 主导
- 必要时 Gemini 只参与表现层收口

---

## Phase D · Game Feel & Presentation（P1 / P2）

### 目标
把“像应用”收敛为“像游戏”。

### 必做
1. 强化命中反馈
2. 强化受击反馈
3. 强化拾取反馈
4. 强化撤离读条与成功/失败提示
5. 让 HUD 更像游戏，而不是表单面板
6. 让大厅 / 结果页 / 操作按钮保持统一视觉语言

### 执行要求
- 必须附参考图或风格关键词
- 只改 visual / scene / feedback / HUD
- 不擅自改协议与判定

### 推荐检查路径
- `client/src/scenes/**`
- `client/src/ui/**`
- `client/src/game/**`
- `client/assets/**` 或 `client/public/**`

### 完成定义
- 测试者不看文档也能理解自己是否命中、受击、拾取、撤离、结算
- 视觉风格统一，不再像业务系统

### 推荐执行者
- Gemini
- GPT-5.4 最终 review

---

## Phase E · Browser Smoke & Acceptance（P0 / P1）

### 目标
让每轮修改都可回归，不再靠手感反复试。

### 必做
1. 保留现有协议 / 后端主链测试
2. 增加浏览器端 smoke test，最少覆盖：
   - 进大厅
   - 创建 / 加入房间
   - 开局
   - 主场景加载
   - 结果页出现
   - 返回大厅
3. 约定截图基线或最少 GIF 验收

### 推荐工具
- Playwright
- 现有脚本体系

### 完成定义
- 一次改动后，可以快速知道“主链有没有又坏掉”

### 推荐执行者
- GPT-5.4

---

## Task Card 模板

```md
# Task Card XX

## 目标
一句话说明本卡只解决什么问题。

## 输入文档
- MASTER_SPEC.md
- WORK_QUEUE.md
- docs/agent/CANONICAL_BASELINE.md
- docs/agent/DELTA_MATRIX.md

## 会改
- path/a
- path/b

## 不会改
- path/c
- path/d

## 是否涉及 shared
- 是 / 否
- 若是：先改 shared，再改消费方

## 验收
- npm run typecheck
- npm run build
- 指定 smoke test
- 指定截图 / GIF

## 完成定义
- 列出 3~5 条可以直接核对的结果
```

---

## 建议起手顺序

1. Task 01：Baseline Audit
2. Task 02：Shared Freeze
3. Task 03：Inventory / Loot / Equip Alignment
4. Task 04：Extract / Settlement / Return to Lobby
5. Task 05：Game Feel Pass
6. Task 06：Browser Smoke Test

---

## 一句话执行原则

**先做可验证的一致性，再做可感知的表现力。**
