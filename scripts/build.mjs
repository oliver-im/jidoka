import { build } from "esbuild";
import { readFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const conventionMd = readFileSync(join(root, "docs/CONVENTION.md"), "utf8");
const outfile = join(root, "dist/cli.js");

await build({
  entryPoints: [join(root, "ts/cli.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __jidokaCreateRequire } from "node:module";',
      "const require = __jidokaCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  define: {
    __JIDOKA_VERSION__: JSON.stringify(pkg.version),
    // Embed the canonical convention doc so `jidoka convention` can print it
    // without reading the filesystem. Generated from docs/CONVENTION.md at
    // build time (never hand-edited); the smoke test asserts the two match.
    __JIDOKA_CONVENTION__: JSON.stringify(conventionMd),
  },
  legalComments: "none",
  logLevel: "info",
});

chmodSync(outfile, 0o755);
console.log(`Bundled ${outfile} (jidoka ${pkg.version})`);
