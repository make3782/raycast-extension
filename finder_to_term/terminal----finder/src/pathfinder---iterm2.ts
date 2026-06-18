import { showHUD, Clipboard } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

export default async function main() {
  try {
    // 1. 从 Path Finder 取当前窗口的目标目录（POSIX 路径）
    const path = (
      await runAppleScript(`
        tell application "Path Finder"
          if (count of finder windows) is 0 then error "没有打开的 Path Finder 窗口"
          set targetFolder to target of finder window 1
          return POSIX path of targetFolder
        end tell
      `)
    ).trim();

    if (!path) {
      await showHUD("❌ 无法获取 Path Finder 的当前路径");
      return;
    }

    // 2. 在 iTerm2 中打开该目录（无窗口则新建窗口，否则在当前窗口新建标签页）
    await runAppleScript(`
      tell application "iTerm"
        activate
        if (count of windows) is 0 then
          set newWindow to (create window with default profile)
          tell current session of newWindow
            write text "cd " & quoted form of ${JSON.stringify(path)}
          end tell
        else
          tell current window
            set newTab to (create tab with default profile)
          end tell
          tell current session of current window
            write text "cd " & quoted form of ${JSON.stringify(path)}
          end tell
        end if
      end tell
    `);

    await showHUD(`✅ 已在 iTerm2 中打开：${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("PathFinder -> iTerm2 失败:", error);
    await Clipboard.copy(message);
    await showHUD(`❌ 出错（已复制到剪贴板）：${message}`);
  }
}
