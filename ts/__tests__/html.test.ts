import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { htmlEscape, renderPlanHtml, renderTopologyHtml } from "../html.js";
import { describe as describeTopology } from "../describe.js";
import { mermaid } from "../mermaid.js";
import {
  parsePlanJson,
  parseTopologyJson,
  type Agent,
  type ExecutionMode,
  type Plan,
  type Topology,
} from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));

const loadTopology = (name: string): Topology => {
  const r = parseTopologyJson(readFileSync(join(here, "fixtures", name), "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const loadPlan = (name: string): Plan => {
  const r = parsePlanJson(readFileSync(join(here, "fixtures", name), "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const makeAgent = (
  id: string,
  model: Agent["model"] = "sonnet",
  blockedBy: string[] = [],
): Agent => ({
  id,
  role: "does",
  model,
  tools: ["Read"],
  blocked_by: blockedBy,
  background: false,
  output: { kind: "inline" },
});

const makeTopology = (mode: ExecutionMode, agents: Agent[]): Topology => ({
  task_summary: "Build a widget",
  execution_mode: mode,
  agents,
});

const minimalHtml = (): string => {
  const t = makeTopology("subagents", [makeAgent("builder", "sonnet")]);
  return renderTopologyHtml(t, ["graph TD\n    main-->builder"], "1. builder (sonnet)");
};

describe("htmlEscape", () => {
  it("escapes <>&\"", () => {
    expect(htmlEscape('<a href="x">&y</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;",
    );
  });
});

describe("renderTopologyHtml", () => {
  it("contains title", () => {
    expect(minimalHtml()).toContain("<title>Topology: Build a widget</title>");
  });

  it("escapes html in title", () => {
    const t: Topology = {
      task_summary: "<script>alert(1)</script>",
      execution_mode: "subagents",
      agents: [makeAgent("a", "haiku")],
    };
    const html = renderTopologyHtml(t, ["graph TD"], "desc");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("loads mermaid CDN", () => {
    expect(minimalHtml()).toContain("mermaid@11.12.2");
  });

  it("no plan → single column, no marked/dompurify", () => {
    const html = minimalHtml();
    expect(html).toContain('class="no-plan"');
    expect(html).not.toContain('<aside class="plan-panel">');
    expect(html).not.toContain("marked@");
    expect(html).not.toContain("dompurify@");
  });

  it("with plan → two-column", () => {
    const t = makeTopology("subagents", [makeAgent("a")]);
    const html = renderTopologyHtml(t, ["graph TD"], "desc", "# Plan\n- step");
    expect(html).toContain('class="has-plan"');
    expect(html).toContain("plan-panel");
    expect(html).toContain("marked@15.0.7");
    expect(html).toContain("dompurify@3.2.4");
    expect(html).toContain("window.__planMarkdown");
  });

  it("plan markdown JSON-encoded", () => {
    const t = makeTopology("subagents", [makeAgent("a")]);
    const html = renderTopologyHtml(
      t,
      ["graph TD"],
      "desc",
      'test "quotes" and\nnewlines',
    );
    expect(html).toContain('\\"quotes\\"');
    expect(html).toContain("\\n");
  });

  it("phase labels for multi-step subagents", () => {
    const t = makeTopology("subagents", [
      makeAgent("a"),
      makeAgent("b", "sonnet", ["a"]),
    ]);
    const html = renderTopologyHtml(t, ["g1", "g2"], "desc");
    expect(html).toContain("Phase 1");
    expect(html).toContain("Phase 2");
  });

  it("no phase labels for single step", () => {
    expect(minimalHtml()).not.toContain("Phase 1");
  });

  it("no phase labels for team mode", () => {
    const t = makeTopology("team", [
      makeAgent("a"),
      makeAgent("b", "sonnet", ["a"]),
    ]);
    expect(renderTopologyHtml(t, ["g"], "desc")).not.toContain(
      '<h3 class="phase-label">',
    );
  });

  it("combined mode label: subagents + team", () => {
    const parent: Agent = {
      ...makeAgent("parent", "opus"),
      execution_mode: "team",
      agents: [makeAgent("child", "haiku")],
    };
    const t = makeTopology("subagents", [parent]);
    expect(renderTopologyHtml(t, ["g"], "desc")).toContain("subagents + team");
  });

  it("simple mode label", () => {
    const html = minimalHtml();
    expect(html).toContain("Mode: subagents");
    expect(html).not.toContain("+ team");
  });

  it("contains legend", () => {
    const html = minimalHtml();
    expect(html).toContain("Legend");
    expect(html).toContain("swatch-haiku");
    expect(html).toContain("swatch-sonnet");
    expect(html).toContain("swatch-opus");
    expect(html).toContain("swatch-main");
    expect(html).toContain("shape-rect");
    expect(html).toContain("shape-pill");
  });

  it("embeds css and js", () => {
    const html = minimalHtml();
    expect(html).toContain("planview styles");
    expect(html).toContain("planview client-side JS");
  });

  it("embeds mermaid graphs", () => {
    const t = makeTopology("subagents", [makeAgent("a")]);
    expect(renderTopologyHtml(t, ["graph TD\n    main-->builder"], "desc"))
      .toContain("graph TD\n    main-->builder");
  });

  it("embeds description", () => {
    const t = makeTopology("subagents", [makeAgent("a")]);
    expect(
      renderTopologyHtml(t, ["graph TD"], "1. builder (sonnet)\n  tools: Read"),
    ).toContain("1. builder (sonnet)");
  });

  it("renders fixture-driven full pipeline", () => {
    const t = loadTopology("valid_minimal.json");
    const html = renderTopologyHtml(t, mermaid(t), describeTopology(t));
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
    expect(html).toContain(t.task_summary);
  });

  it("renders nested fixture with plan markdown", () => {
    const t = loadTopology("valid_nested.json");
    const html = renderTopologyHtml(
      t,
      mermaid(t),
      describeTopology(t),
      "# Test Plan\n\nSome content",
    );
    expect(html).toContain('class="has-plan"');
    expect(html).toContain("window.__planMarkdown");
  });
});

describe("renderPlanHtml", () => {
  it("basic structure", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    const html = renderPlanHtml(plan, "260505-0-tidy-readme");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Plan: Bump version and tidy README</title>");
    expect(html).toContain('class="plan"');
    expect(html).toContain("Plan: Bump version and tidy README");
    expect(html).toContain("1 unit");
    expect(html).not.toMatch(/\b1 units\b/);
    expect(html).toContain("planview styles");
    expect(html).toContain("planview client-side JS");
  });

  it("renders unit cards with anchors", () => {
    const plan = loadPlan("valid_plan_sequential.json");
    const html = renderPlanHtml(plan, "260505-0-sequential-refactor");

    expect(html).toContain('href="#unit-01-types"');
    expect(html).toContain('href="#unit-02-validate"');
    expect(html).toContain('id="unit-03-render"');

    expect(html).toContain("Unit 01 — Add types");
    expect(html).toContain("Unit 02 — Validate");
    expect(html).toContain("Unit 03 — Render");

    expect(html).toContain("Blocked by: 01-types");
    expect(html).toContain("Blocked by: —");
    expect(html).toContain("main only");
  });

  it("emits mermaid only for units with topology", () => {
    const plan = loadPlan("valid_plan_with_topology.json");
    const html = renderPlanHtml(plan, "260505-0-multi-agent-unit");

    const idx1 = html.indexOf('id="unit-01-prep"');
    const idx2 = html.indexOf('id="unit-02-team-build"');
    expect(idx1).toBeGreaterThan(-1);
    expect(idx2).toBeGreaterThan(idx1);

    const unit01Section = html.slice(idx1, idx2);
    expect(unit01Section).not.toContain('class="chip chip-topology"');
    expect(unit01Section).not.toContain('<pre class="mermaid"');

    const unit02Section = html.slice(idx2);
    expect(unit02Section).toContain('class="chip chip-topology"');
    expect(unit02Section).toContain('<pre class="mermaid"');
    expect(unit02Section).toContain("frontend");
    expect(unit02Section).toContain("integrator");
  });

  it("embeds overview md and unit bodies as JSON", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    const html = renderPlanHtml(plan, "260505-0-tidy-readme");
    expect(html).toContain("window.__overviewMarkdown =");
    expect(html).toContain("window.__unitBodies =");
    expect(html).toContain("\\n## Goal");
  });

  it("loads marked and dompurify", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    const html = renderPlanHtml(plan, "260505-0-tidy-readme");
    expect(html).toContain("mermaid@11.12.2");
    expect(html).toContain("marked@15.0.7");
    expect(html).toContain("dompurify@3.2.4");
  });

  it("renders resolved review commands", () => {
    const plan = loadPlan("valid_plan_sequential.json");
    plan.units[0]!.review = ["/code-review:code-review", "/codex:review"];
    const html = renderPlanHtml(plan, "260505-0-sequential-refactor");
    expect(html).toContain("<code>/code-review:code-review</code>");
    expect(html).toContain("<code>/codex:review</code>");
    expect(html).toContain("<h3>Review pipeline</h3>");
  });

  it("escapes dangerous unit titles", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    plan.units[0]!.title = "<script>alert(1)</script>";
    const html = renderPlanHtml(plan, "260505-0-tidy-readme");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("defends against script breakout in unit body via JSON encoding", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    plan.units[0]!.body_markdown = "Hi </script><img src=x onerror=alert(1)>";
    const html = renderPlanHtml(plan, "260505-0-tidy-readme");
    expect(html).not.toContain("</script><img src=x");
    expect(html).toContain("<\\/script>");
  });
});
