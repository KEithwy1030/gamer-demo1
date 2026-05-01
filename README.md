# Gamer Demo 1

Browser-first multiplayer extraction prototype in a monorepo.

- `client/`: TypeScript + Phaser 3 + Vite
- `server/`: Node.js + Express + Socket.IO
- `shared/`: shared protocol, types, and static data

## Primary Design Reference

- Original game design document: [GDD_Demo1_v1.3.docx](/E:/CursorData/gamer/GDD_Demo1_v1.3.docx)
- Text export of the original design document: [docs/archive/GDD_Demo1_v1.3.txt](/E:/CursorData/gamer/docs/archive/GDD_Demo1_v1.3.txt)
- Current demo contract: [docs/agent/DEMO1_DELIVERY_CONTRACT.md](/E:/CursorData/gamer/docs/agent/DEMO1_DELIVERY_CONTRACT.md)
- Current repo truth: [docs/agent/NOW.md](/E:/CursorData/gamer/docs/agent/NOW.md)

## Quick Start

- `npm install`
- `npm run dev --workspace server`
- `npm run dev --workspace client`

- Default client: `http://localhost:5173/`
- Server health: `http://localhost:3000/health`

## Validation

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run validate:carry-loop`

Do not treat repository documents as guaranteed live truth. Current code and current validation output win.
