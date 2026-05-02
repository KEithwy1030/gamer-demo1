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

## Gameplay

在战场里用 WASD 移动，鼠标左键攻击，Q / E / R 释放武器技能，空格闪避，Tab 打开背包。撤离点开放后靠近撤离点按 F，站稳 5 秒完成撤离。

三种武器定位不同：剑适合高频压制和灵活缠斗，刀适合均衡正面对拼，枪适合长距离重击和抓失误。

撤离点第 8 分钟开放。尸毒迷雾会逐步压缩视野，并在撤离窗口开始后扣血，越晚停留压力越大。

成功撤离后回到大厅，进入黑市，选择带回的物资，设置金币卖价后挂出。Demo 1 里不会成交，挂单可以改价或取消。
