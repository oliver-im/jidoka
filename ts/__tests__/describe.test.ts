import { describe as describeTest, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe } from "../describe.js";
import { parseTopologyJson, type Agent, type ExecutionMode, type Output, type Topology } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Topology => {
  const json = readFileSync(join(here, "fixtures", name), "utf8");
  const r = parseTopologyJson(json);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const makeAgent = (
  id: string,
  model: Agent["model"],
  tools: string[],
  output: Output,
  blockedBy: string[] = [],
): Agent => ({
  id,
  role: "does stuff",
  model,
  tools,
  blocked_by: blockedBy,
  background: false,
  output,
});

const makeTopology = (mode: ExecutionMode, agents: Agent[]): Topology => ({
  task_summary: "test",
  execution_mode: mode,
  agents,
});

describeTest("describe", () => {
  it("single agent basic", () => {
    const t = makeTopology("subagents", [
      makeAgent("builder", "sonnet", ["Read", "Write"], { kind: "inline" }),
    ]);
    expect(describe(t)).toBe(
      '1. builder (sonnet)\n  tools: Read, Write\n  returns "" to the main agent',
    );
  });

  it("no trailing newline", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "haiku", [], { kind: "inline" }),
    ]);
    expect(describe(t).endsWith("\n")).toBe(false);
  });

  it("parallel agents get letters", () => {
    const t = makeTopology("subagents", [
      makeAgent("alpha", "haiku", [], { kind: "inline" }),
      makeAgent("beta", "sonnet", [], { kind: "inline" }),
    ]);
    const out = describe(t);
    expect(out).toContain("1a. alpha (haiku)");
    expect(out).toContain("1b. beta (sonnet)");
  });

  it("solo agent has no letter", () => {
    const t = makeTopology("subagents", [
      makeAgent("solo", "opus", [], { kind: "inline" }),
    ]);
    const out = describe(t);
    expect(out).toContain("1. solo (opus)");
    expect(out).not.toContain("1a.");
  });

  it("multi-phase headers", () => {
    const t = makeTopology("subagents", [
      makeAgent("first", "haiku", [], { kind: "inline" }),
      makeAgent("second", "sonnet", [], { kind: "inline" }, ["first"]),
    ]);
    const out = describe(t);
    expect(out).toContain("Phase 1");
    expect(out).toContain("Phase 2");
  });

  it("multi-phase resets step number to 1", () => {
    const t = makeTopology("subagents", [
      makeAgent("first", "haiku", [], { kind: "inline" }),
      makeAgent("second", "sonnet", [], { kind: "inline" }, ["first"]),
    ]);
    const out = describe(t);
    const startsWith1Dot = out.split("\n").filter((l) => l.startsWith("1. ")).length;
    expect(startsWith1Dot).toBe(2);
    expect(out).not.toContain("2. ");
  });

  it("single-step no phase header", () => {
    const t = makeTopology("subagents", [
      makeAgent("only", "sonnet", [], { kind: "inline" }),
    ]);
    expect(describe(t)).not.toContain("Phase");
  });

  it("team mode no phase header", () => {
    const t = makeTopology("team", [
      makeAgent("a", "haiku", [], { kind: "inline" }),
      makeAgent("b", "sonnet", [], { kind: "inline" }, ["a"]),
    ]);
    expect(describe(t)).not.toContain("Phase");
  });

  it("team passes to dependent", () => {
    const t = makeTopology("team", [
      makeAgent("producer", "sonnet", [], { kind: "inline" }),
      makeAgent("consumer", "opus", [], { kind: "inline" }, ["producer"]),
    ]);
    expect(describe(t)).toContain('passes "" to consumer');
  });

  it("team consumer with no dependents returns to main", () => {
    const t = makeTopology("team", [
      makeAgent("producer", "sonnet", [], { kind: "inline" }),
      makeAgent("consumer", "opus", [], { kind: "inline" }, ["producer"]),
    ]);
    expect(describe(t)).toContain('returns "" to the main agent');
  });

  it("file output writes to path", () => {
    const t = makeTopology("subagents", [
      makeAgent("writer", "sonnet", ["Write"], { kind: "file", path: "out.md" }),
    ]);
    expect(describe(t)).toContain('writes "" to out.md');
  });

  it("produces shows in quotes", () => {
    const a = makeAgent("a", "haiku", [], { kind: "inline" });
    a.produces = "summary";
    expect(describe(makeTopology("subagents", [a]))).toContain(
      'returns "summary" to the main agent',
    );
  });

  it("nested agents are indented", () => {
    const child = makeAgent("inner", "haiku", ["Read"], { kind: "inline" });
    const parent: Agent = {
      ...makeAgent("outer", "opus", ["Write"], { kind: "inline" }),
      execution_mode: "subagents",
      agents: [child],
    };
    const out = describe(makeTopology("subagents", [parent]));
    expect(out).toContain("  1. inner (haiku)");
    expect(out).toContain("    tools: Read");
  });

  it("nested fallback target is parent id", () => {
    const child = makeAgent("inner", "haiku", [], { kind: "inline" });
    const parent: Agent = {
      ...makeAgent("outer", "opus", [], { kind: "inline" }),
      execution_mode: "subagents",
      agents: [child],
    };
    expect(describe(makeTopology("subagents", [parent]))).toContain(
      'returns "" to outer',
    );
  });

  it("tools are comma-space-separated", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", ["Read", "Write", "Bash"], { kind: "inline" }),
    ]);
    expect(describe(t)).toContain("tools: Read, Write, Bash");
  });

  // === fixture-driven sanity ============================================

  it("valid_minimal fixture", () => {
    const out = describe(fixture("valid_minimal.json"));
    expect(out).toContain("1. builder (sonnet)");
    expect(out).toContain("tools: Read, Write");
    expect(out).not.toContain("Phase");
  });

  it("valid_team fixture", () => {
    const out = describe(fixture("valid_team.json"));
    expect(out).toContain("1a. frontend (sonnet)");
    expect(out).toContain("1b. backend (sonnet)");
    expect(out).toContain("2. integrator (opus)");
    expect(out).toContain('passes "updated UI" to integrator');
    expect(out).toContain('passes "updated API" to integrator');
    expect(out).not.toContain("Phase");
  });

  it("valid_nested fixture", () => {
    const out = describe(fixture("valid_nested.json"));
    expect(out).toContain("Phase 1");
    expect(out).toContain("Phase 2");
    expect(out).toContain("1. researcher (haiku)");
    expect(out).toContain("1. implementer (opus)");
    expect(out).toContain("  1. coder (sonnet)");
    expect(out).toContain('    writes "feature code" to src/feature.rs');
    expect(out).toContain('    writes "test suite" to tests/feature_test.rs');
  });
});
