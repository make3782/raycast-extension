import { showHUD, Clipboard } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

export default async function main() {
  try {
    // 1. 从 iTerm2 取当前会话的工作目录
    const path = (
      await runAppleScript(`
        tell application "iTerm"
          if (count of windows) is 0 then error "没有打开的 iTerm2 窗口"
          tell current session of current window
            return (variable named "session.path")
          end tell
        end tell
      `)
    ).trim();

    if (!path) {
      await showHUD("❌ 无法获取 iTerm2 的当前工作目录");
      return;
    }

    // 2. 在 Path Finder 中打开该目录
    await runAppleScript(`
      set targetFolder to (POSIX file ${JSON.stringify(path)}) as alias
      tell application "Path Finder"
        activate
        open targetFolder
      end tell
    `);

    await showHUD(`✅ 已在 Path Finder 中打开：${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("iTerm2 -> PathFinder 失败:", error);
    await Clipboard.copy(message);
    await showHUD(`❌ 出错（已复制到剪贴板）：${message}`);
  }
}
