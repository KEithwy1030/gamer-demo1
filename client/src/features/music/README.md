# 音乐系统（客户端）

> 这是流荒之路的"音乐系统（客户端）"板块。
> 整体架构见 `docs/REFACTOR-GUIDE.md`。
> 修改此板块代码前必读：本 README + REFACTOR-GUIDE 第一部分（产品铁则）。

## 状态

新独立

## 负责什么

背景音乐状态机（lobby / calm / skirmish / danger / extract_pressure / death / victory）。

## 监听哪些事件

- `MusicModeChanged`（唯一输入。服务端是模式真相源，本板块不从 PhaseStarted/PlayerDied 等事件自行推断模式）

## 数据存哪里

当前 BGM 模式（`ProceduralMusicEngine.scene.mode`）

## 当前代码位置

- `musicDirector.ts` — `mountMusicDirector()` 在 `createGameClient` 与其余音频板块一起挂载。
- 实现是程序化 WebAudio 合成（drone / pad / pulse / heartbeat 四层），无外部音频文件。
- 各模式配器参数在 `MODE_SPECS` 常量里，调音只动这个表。
