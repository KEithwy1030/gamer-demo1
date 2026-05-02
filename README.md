# Gamer Demo 1

Browser-first multiplayer extraction prototype in a monorepo.

- `client/`: TypeScript + Phaser 3 + Vite
- `server/`: Node.js + Express + Socket.IO
- `shared/`: shared protocol, types, and static data

Product spec: [GDD.md](GDD.md)

## Quick Start

- `npm install`
- `npm run dev --workspace server`
- `npm run dev --workspace client`

Default client: `http://localhost:5173/`
Server health: `http://localhost:3000/health`

## Validation

- `npm run typecheck`
- `npm run build`
