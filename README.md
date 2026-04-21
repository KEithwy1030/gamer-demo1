# 搜打撤 · Demo 1

浏览器局域网联机的 2D 俯视角搜打撤原型，代码是 monorepo：

- `client/`: `TypeScript + Phaser 3 + Vite`
- `server/`: `Node.js + Express + Socket.IO`
- `shared/`: 共享类型、协议和静态数据

## Canonical Docs

- 规则真源：[MASTER_SPEC.md](/E:/CursorData/gamer/MASTER_SPEC.md)
- 执行清单：[WORK_QUEUE.md](/E:/CursorData/gamer/WORK_QUEUE.md)
- 当前实现基线：[docs/agent/CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md)
- 规格差异矩阵：[docs/agent/DELTA_MATRIX.md](/E:/CursorData/gamer/docs/agent/DELTA_MATRIX.md)
- 持续状态记录：[docs/agent/STATUS.json](/E:/CursorData/gamer/docs/agent/STATUS.json), [docs/agent/PROJECT_STATE.md](/E:/CursorData/gamer/docs/agent/PROJECT_STATE.md), [docs/agent/OPEN_LOOPS.md](/E:/CursorData/gamer/docs/agent/OPEN_LOOPS.md), [docs/agent/DECISIONS.md](/E:/CursorData/gamer/docs/agent/DECISIONS.md), [docs/agent/WORKLOG.md](/E:/CursorData/gamer/docs/agent/WORKLOG.md)

`README.md` 只保留简要说明，不再承载可漂移参数。运行时数值、消费路径、已知偏差以 baseline/delta 文档为准。

## Quick Start

```bash
npm install
npm run dev --workspace server
npm run dev --workspace client
```

- 本机默认客户端：`http://localhost:5173/`
- 服务端健康检查：`http://localhost:3000/health`
- 局域网访问地址以当前主机 IP 为准，见 [docs/agent/CANONICAL_BASELINE.md](/E:/CursorData/gamer/docs/agent/CANONICAL_BASELINE.md)

## Automated Check

```bash
node scripts/test-loop.mjs
```

该脚本覆盖 `create -> join -> start -> combat -> pickup -> extract -> settlement` 的后端主链。

## Historical References

- 历史设计源：[GDD_Demo1_v1.3.docx](/E:/CursorData/gamer/GDD_Demo1_v1.3.docx)
- 历史/废弃文档目录：[docs/archive/](/E:/CursorData/gamer/docs/archive/README.md)
