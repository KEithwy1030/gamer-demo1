# Godot Environment

日期：2026-07-19
状态：Builder 后台验证可用

## Tool

- Version：`4.7.1.stable.official.a13da4feb`
- Edition：Standard / GDScript / Windows x86_64
- CLI：`E:\CursorData\godot\tools\Godot\4.7.1-stable\Godot_v4.7.1-stable_win64_console.exe`
- 用法：所有 agent 自动验证只使用绝对路径和 `--headless`；未经本次明确授权不得启动 GUI。

版本验证：

```powershell
& 'E:\CursorData\godot\tools\Godot\4.7.1-stable\Godot_v4.7.1-stable_win64_console.exe' --version
```

2026-07-19 返回 `4.7.1.stable.official.a13da4feb`。

## Current Limits

- 未安装 export templates；本阶段不做打包导出。
- 当前没有为 ExilesRun 明确分配的 GUI 测试 VM；实际渲染、窗口输入和录像保持 `NEEDS_REVIEW`，由 Producer 安排隔离 VM。
- 宿主前台测试必须重新申请单次真机租约。

工具来源、哈希与签名证据继承自 `PayYourLife/docs/production/GODOT_ENVIRONMENT.md` 的同一安装记录。
