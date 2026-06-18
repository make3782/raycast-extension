# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Raycast 扩展（`terminal----finder`，标题 "Terminal <--> Finder"），用于在文件管理器（PathFinder）和终端（iTerm2）之间互相跳转：把当前 PathFinder 的路径在 iTerm2 中打开，或反过来把 iTerm2 的当前工作目录在 PathFinder 中打开。

## 常用命令

- `npm run dev` —— 运行 `ray develop`，热加载扩展到本地 Raycast 应用中进行调试。
- `npm run build` —— 运行 `ray build`，进行类型检查并编译。
- `npm run lint` / `npm run fix-lint` —— 运行 `ray lint`（基于 `@raycast/eslint-config` 的 ESLint，集成 Prettier）。
- `npm run publish` —— 发布到 Raycast Store（注意：不是发布到 npm）。

项目没有配置测试框架。验证方式是运行 `npm run dev`，然后在 Raycast 中触发对应命令进行手动验证。

## 架构

这是一个基于命令（command）的 Raycast 扩展，不是带界面的应用。关键约定：

- 每个命令在 `package.json` 的 `commands[]` 中声明，其中 `name` **必须与 `src/` 下的文件名（不含扩展名）完全一致**。当前两个命令分别对应 `src/pathfinder---iterm2.ts` 和 `src/iterm2---pathfinder.ts`。
- 两个命令都使用 `"mode": "no-view"` —— 它们作为后台动作运行（没有 React 界面），因此每个文件的 `export default async function main()` 直接执行动作，并通过 `showHUD` 反馈结果。
- `raycast-env.d.ts` 由 `ray` 自动生成（已 gitignore），不要手动编辑。修改 `package.json` 中的命令或偏好设置声明后，运行 `ray build` / `ray develop` 重新生成。

## 实现说明

两个命令均已实现，都通过 `@raycast/utils` 的 `runAppleScript` 驱动 AppleScript 与 Path Finder / iTerm2 交互：

- `src/pathfinder---iterm2.ts`：读取 Path Finder 当前窗口的目标目录（`POSIX path of target of finder window 1`），然后在 iTerm2 中 `cd` 进去——无窗口时新建窗口，否则在当前窗口新建标签页。
- `src/iterm2---pathfinder.ts`：读取 iTerm2 当前会话的工作目录（`variable named "session.path"`），然后在 Path Finder 中 `open` 该目录。

两者统一的错误处理约定：捕获异常后把错误信息复制到剪贴板，并用 `showHUD` 反馈（成功 ✅ / 失败 ❌）。向 AppleScript 注入路径时用 `JSON.stringify(path)` 做转义，避免空格 / 特殊字符问题。
