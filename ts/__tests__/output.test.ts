import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeTempHtml } from "../output.js";

let counter = 0;
function makeTempDir(label: string): string {
  const path = join(
    tmpdir(),
    `planview-out-test-${process.pid}-${Date.now()}-${counter++}-${label}`,
  );
  mkdirSync(path, { recursive: true });
  return path;
}

describe("writeTempHtml", () => {
  it("writes content to a file in the given dir", () => {
    const dir = makeTempDir("write");
    const path = writeTempHtml("<html>hi</html>", dir);
    expect(path.startsWith(dir)).toBe(true);
    expect(path.endsWith(".html")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("<html>hi</html>");
    rmSync(dir, { recursive: true, force: true });
  });

  it("uses a planview-<timestamp>.html filename", () => {
    const dir = makeTempDir("name");
    const path = writeTempHtml("x", dir);
    expect(path).toMatch(/planview-\d+\.html$/);
    rmSync(dir, { recursive: true, force: true });
  });
});
