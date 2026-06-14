import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function writeTempHtml(html: string, dir: string = tmpdir()): string {
  const timestamp = Date.now();
  const path = join(dir, `jidoka-${timestamp}.html`);
  writeFileSync(path, html);
  return path;
}

export function openBrowser(path: string): void {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/C", "start", "", path]]
      : process.platform === "darwin"
        ? ["open", [path]]
        : ["xdg-open", [path]];
  // `spawn(...).unref()` lets us exit before the opener finishes, but a missing
  // binary fires an async `error` event — without this listener Node would
  // crash the parent with an unhandled exception even though our own work is
  // done. Swallow the failure so headless or stripped-down environments don't
  // fail an otherwise-successful render.
  const child = spawn(cmd as string, args as string[], {
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (err) => {
    process.stderr.write(`jidoka: could not open browser (${cmd}): ${err.message}\n`);
  });
  child.unref();
}
