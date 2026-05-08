import { describe, expect, it } from "vitest";
import { escapeId, mermaid } from "../mermaid.js";
import type { Agent, ExecutionMode, Output, Topology } from "../types.js";

const makeAgent = (
  id: string,
  model: Agent["model"],
  output: Output,
  blockedBy: string[] = [],
): Agent => ({
  id,
  role: "does stuff",
  model,
  tools: [],
  blocked_by: blockedBy,
  background: false,
  output,
});

const makeTopology = (mode: ExecutionMode, agents: Agent[]): Topology => ({
  task_summary: "test",
  execution_mode: mode,
  agents,
});

describe("escapeId", () => {
  it("passes simple ids through", () => {
    expect(escapeId("simple")).toBe("simple");
  });
  it("replaces hyphens with underscores", () => {
    expect(escapeId("a-b-c")).toBe("a_b_c");
  });
});

describe("mermaid subagents", () => {
  it("single step → one graph", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
    ]);
    expect(mermaid(t).length).toBe(1);
  });

  it("two phases → two graphs", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
      makeAgent("b", "sonnet", { kind: "inline" }, ["a"]),
    ]);
    expect(mermaid(t).length).toBe(2);
  });

  it("main edges go to current-phase agents only", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
      makeAgent("b", "sonnet", { kind: "inline" }, ["a"]),
    ]);
    const [g1, g2] = mermaid(t);
    expect(g1).toContain("main --> a");
    expect(g1).not.toContain("main --> b");
    expect(g2).toContain("main --> b");
    expect(g2).not.toContain("main --> a");
  });

  it("inline output → square brackets", () => {
    const t = makeTopology("subagents", [
      makeAgent("builder", "sonnet", { kind: "inline" }),
    ]);
    expect(mermaid(t)[0]).toContain('builder["builder (sonnet)"]:::sonnet');
  });

  it("file output → rounded brackets", () => {
    const t = makeTopology("subagents", [
      makeAgent("coder", "sonnet", { kind: "file", path: "out.rs" }),
    ]);
    expect(mermaid(t)[0]).toContain('coder(["coder (sonnet)"]):::sonnet');
  });

  it("hyphenated id → escaped node id, original label", () => {
    const t = makeTopology("subagents", [
      makeAgent("my-agent", "haiku", { kind: "inline" }),
    ]);
    expect(mermaid(t)[0]).toContain('my_agent["my-agent (haiku)"]:::haiku');
  });
});

describe("mermaid team", () => {
  it("single graph", () => {
    const t = makeTopology("team", [
      makeAgent("a", "sonnet", { kind: "inline" }),
      makeAgent("b", "sonnet", { kind: "inline" }),
    ]);
    expect(mermaid(t).length).toBe(1);
  });

  it("has team subgraph wrapper", () => {
    const t = makeTopology("team", [
      makeAgent("a", "sonnet", { kind: "inline" }),
    ]);
    const g = mermaid(t)[0]!;
    expect(g).toContain('subgraph team["team"]');
    expect(g).toContain("end");
  });

  it("main → only unblocked agents", () => {
    const t = makeTopology("team", [
      makeAgent("frontend", "sonnet", { kind: "inline" }),
      makeAgent("backend", "sonnet", { kind: "inline" }),
      makeAgent("integrator", "opus", { kind: "inline" }, ["frontend", "backend"]),
    ]);
    const g = mermaid(t)[0]!;
    expect(g).toContain("main --> frontend");
    expect(g).toContain("main --> backend");
    expect(g).not.toContain("main --> integrator");
  });

  it("blocked_by → edges between agents", () => {
    const t = makeTopology("team", [
      makeAgent("frontend", "sonnet", { kind: "inline" }),
      makeAgent("integrator", "opus", { kind: "inline" }, ["frontend"]),
    ]);
    expect(mermaid(t)[0]).toContain("frontend --> integrator");
  });
});

describe("mermaid nested", () => {
  it("nested team gets a subgraph", () => {
    const parent: Agent = {
      ...makeAgent("parent", "opus", { kind: "inline" }),
      execution_mode: "team",
      agents: [makeAgent("child-a", "haiku", { kind: "inline" })],
    };
    const t = makeTopology("subagents", [parent]);
    expect(mermaid(t)[0]).toContain('subgraph parent_team["parent team"]');
  });

  it("nested subagents do not get a subgraph", () => {
    const parent: Agent = {
      ...makeAgent("parent", "opus", { kind: "inline" }),
      execution_mode: "subagents",
      agents: [makeAgent("child", "haiku", { kind: "inline" })],
    };
    expect(mermaid(makeTopology("subagents", [parent]))[0]).not.toContain(
      "subgraph parent",
    );
  });
});

describe("mermaid common structure", () => {
  it("every graph starts with `graph TD`", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
      makeAgent("b", "sonnet", { kind: "inline" }, ["a"]),
    ]);
    for (const g of mermaid(t)) {
      expect(g.startsWith("graph TD")).toBe(true);
    }
  });

  it("emits all four classDefs", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
    ]);
    const g = mermaid(t)[0]!;
    expect(g).toContain("classDef haiku");
    expect(g).toContain("classDef sonnet");
    expect(g).toContain("classDef opus");
    expect(g).toContain("classDef main");
  });

  it("main node uses round-corner shape and main class", () => {
    const t = makeTopology("subagents", [
      makeAgent("a", "sonnet", { kind: "inline" }),
    ]);
    expect(mermaid(t)[0]).toContain('main(("main agent")):::main');
  });
});
