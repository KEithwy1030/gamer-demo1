# GEMINI.md - 前端优化任务记录与规则

## 1. 任务概览
- **Session ID**: 0e342e86-035c-4352-9c42-55270a6fc1c9
- **核心目标**: 针对《流荒之路》前端进行“顶级设计师”级别的视觉与手感优化。
- **当前分支**: `feat-frontend-optimization`
- **回滚备份**: `pre-optimization-backup`

## 2. 执行原则 (Hard Rules)
1. **先存档后动手**: 任何重大变动前必须确认 Git 状态。
2. **Plan-first**: 所有修改必须先在 Plan 模式下对齐逻辑，禁止盲目重构。
3. **闭环验证 (Closed-Loop Validation)**: 【绝对红线】禁止在未经过自检（如 `npm run typecheck`、逻辑 review 或手动运行测试）的情况下宣告任务完成。你必须作为自己的 QA。
4. **局部优化 vs 彻底重构**: 聚焦于高价值、高感知的局部优化（如 Shader、打击感、UI 细节），严禁为了“优雅”而引入破坏性重构。
5. **反 Slop 协议**: 输出必须具备独特的“暗黑美学”，严禁生成通用的、充满 AI 痕迹的视觉产物。
6. **冒死执行与安全退出**: 技术上追求极致和创新，但必须保证系统的稳定性。

## 3. 考核与审核标准 (Evaluation Criteria)
- **代码完整性 (Integrity)**: 是否存在未定义的变量、丢失的导入或类型冲突？（必须 100% 通过编译）
- **视觉冲击力**: 尸毒迷雾、UI 质感是否有质的提升？
- **打击感**: 战斗反馈（震屏、闪白、飘字）是否让操作更有真实感？
- **系统稳定性**: 优化是否引入了新的 Bug 或导致性能大幅下降？
- **自检证明**: 提交时是否附带了测试通过的证据（如 Terminal 输出、截图或 Log）？

## 4. 优化清单 (Roadmap)
- [ ] **Phase 1: 环境氛围重塑** - 引入 WebGL Shader Pipeline 替换 Canvas 迷雾。
- [ ] **Phase 2: 战斗反馈增强** - 植入 Hit Stop, Screen Shake 与优化后的飘字系统。
- [ ] **Phase 3: UI 交互精致化** - 装备品质辉光与背包网格高亮逻辑。

---
*Created by Antigravity (Top-tier Game Frontend Designer Mode)*
