import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("version consistency", () => {
  it("package.json, plugin.json, and marketplace.json declare the same version", () => {
    // Reuse the same check the release flow and CI run — surface its table on failure.
    try {
      const out = execFileSync(join(root, "scripts/check-version.sh"), {
        encoding: "utf8",
      });
      expect(out).toContain("All manifests agree");
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      throw new Error((err.stdout ?? "") + (err.stderr ?? ""));
    }
  });
});
