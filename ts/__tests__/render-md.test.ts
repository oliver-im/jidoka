import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildOverviewMd,
  buildProgressMd,
  buildUnitMd,
  unitIdPrefix,
} from "../render-md.js";
import {
  parsePlanJson,
  type Agent,
  type Plan,
  type Topology,
  type Unit,
} from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const loadPlan = (name: string): Plan => {
  const r = parsePlanJson(readFileSync(join(here, "fixtures", name), "utf8"));
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

const minimalUnit = (id: string, blockedBy: string[] = []): Unit => ({
  id,
  title: `Title for ${id}`,
  summary: `Summary for ${id}.`,
  blocked_by: blockedBy,
  body_markdown: `## Tasks\n\nDo ${id}.\n`,
  review: ["/code-review:code-review"],
});

describe("unitIdPrefix", () => {
  it("extracts two-digit prefix", () => {
    expect(unitIdPrefix("01-housekeeping")).toBe("01");
    expect(unitIdPrefix("99-end")).toBe("99");
  });
  it("returns undefined for non-matching ids", () => {
    expect(unitIdPrefix("foo")).toBeUndefined();
    expect(unitIdPrefix("1-foo")).toBeUndefined();
  });
});

describe("buildOverviewMd", () => {
  it("emits header, goal, decisions, table", () => {
    const plan: Plan = {
      task_summary: "Pivot the renderer",
      slug: "pivot-renderer",
      units: [
        minimalUnit("01-prep"),
        minimalUnit("02-impl", ["01-prep"]),
      ],
    };
    const md = buildOverviewMd(plan, "260505-0-pivot-renderer");

    expect(md).toContain("# 260505-0-pivot-renderer — Pivot the renderer");
    expect(md).toContain("## Goal");
    expect(md).toContain("Pivot the renderer.");
    expect(md).toContain("## Context");
    expect(md).toContain("## Decisions (locked, v1)");
    expect(md).toContain("## Out of scope (v1)");
    expect(md).toContain("## Unit list");
    expect(md).toContain(
      "| 01 | Title for 01-prep | — | /code-review:code-review |",
    );
    expect(md).toContain(
      "| 02 | Title for 02-impl | 01 | /code-review:code-review |",
    );
    expect(md).toContain("## Cross-cutting constraints");
    expect(md).toContain("## References");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("does not duplicate trailing period in goal", () => {
    const plan: Plan = {
      task_summary: "Already a sentence.",
      slug: "x",
      units: [minimalUnit("01-x")],
    };
    const md = buildOverviewMd(plan, "260505-0-x");
    expect(md).toContain("Already a sentence.");
    expect(md).not.toContain("Already a sentence..");
  });
});

describe("buildProgressMd", () => {
  it("uses the first unit as cursor", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep"), minimalUnit("02-impl")],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("# 260505-0-x — Progress");
    expect(md).toContain("**Cursor:** 01-prep (not started).");
    expect(md).toContain("## Done");
    expect(md).toContain("## Blockers");
    expect(md).toContain("## Notes");
    expect(md).toContain("## Pre-execution review");
    expect(md).toContain("_No pre-execution review configured.");
    expect(md).toContain("## Plan-level review");
    expect(md).toContain("_No plan-level reviews configured.");
  });

  it("falls back when no units", () => {
    const plan: Plan = { task_summary: "x", slug: "x", units: [] };
    expect(buildProgressMd(plan, "x")).toContain("**Cursor:** (no units)");
  });

  it("renders a configured plan-level pipeline", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      plan_review: ["/code-review:code-review", "/codex:adversarial-review"],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("## Plan-level review");
    expect(md).toContain(
      "After the last unit's review lands and is committed",
    );
    expect(md).toContain("- [ ] `/code-review:code-review`");
    expect(md).toContain("- [ ] `/codex:adversarial-review`");
  });

  it("renders a configured pre-execution review", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: ["/planview:pre-plan-review"],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("## Pre-execution review");
    expect(md).toContain(
      "Before starting the first unit, run these",
    );
    expect(md).toContain("- [ ] `/planview:pre-plan-review`");
  });

  it("orders Pre-execution review before Plan-level review", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: ["/planview:pre-plan-review"],
      plan_review: ["/codex:adversarial-review"],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md.indexOf("## Pre-execution review")).toBeLessThan(
      md.indexOf("## Plan-level review"),
    );
  });
});

describe("buildUnitMd", () => {
  it("renders title, blocked_by, agents, topology=none", () => {
    const md = buildUnitMd(minimalUnit("01-foo"));
    expect(md).toContain("# Unit 01 — Title for 01-foo");
    expect(md).toContain("**Blocked by:** none");
    expect(md).toContain("**Agents involved:** main only");
    expect(md).toContain("**Topology:** none");
    expect(md).toContain("## Summary");
    expect(md).toContain("Summary for 01-foo.");
    expect(md).toContain("## Tasks");
    expect(md).toContain("Do 01-foo.");
    expect(md).toContain("## Review pipeline");
    expect(md).toContain("- [ ] `/code-review:code-review`");
    expect(md).toContain(
      "See `progress.md` for the cursor and overall plan state.",
    );
  });

  it("renders blocked_by as comma-joined", () => {
    const u = minimalUnit("02-bar", ["01-a", "01-b"]);
    expect(buildUnitMd(u)).toContain("**Blocked by:** 01-a, 01-b");
  });

  it("renders agents_involved when present", () => {
    const u: Unit = { ...minimalUnit("01-x"), agents_involved: ["a", "b"] };
    expect(buildUnitMd(u)).toContain("**Agents involved:** a, b");
  });

  it("emits no review steps placeholder when review list is empty", () => {
    const u: Unit = { ...minimalUnit("01-x"), review: [] };
    expect(buildUnitMd(u)).toContain("- [ ] _No review steps configured._");
  });

  it("emits no review steps placeholder when review is absent", () => {
    const u: Unit = { ...minimalUnit("01-x") };
    delete u.review;
    expect(buildUnitMd(u)).toContain("- [ ] _No review steps configured._");
  });

  it("embeds mermaid block when unit has topology", () => {
    const topology: Topology = {
      task_summary: "Two writers",
      execution_mode: "team",
      agents: [
        agent("writer"),
        { ...agent("reviewer"), blocked_by: ["writer"] },
      ],
    };
    const u: Unit = {
      ...minimalUnit("01-team"),
      agents_involved: ["writer", "reviewer"],
      topology,
    };
    const md = buildUnitMd(u);
    expect(md).toContain("**Topology:** present");
    expect(md).toContain("```mermaid");
    expect(md).toContain("graph TD");
    expect(md).toContain("writer");
    expect(md).toContain("reviewer");
  });
});

function agent(id: string): Agent {
  return {
    id,
    role: "does",
    model: "sonnet",
    tools: [],
    blocked_by: [],
    background: false,
    output: { kind: "inline" },
  };
}

describe("buildOverviewMd from real fixtures", () => {
  it("valid_plan_minimal renders", () => {
    const plan = loadPlan("valid_plan_minimal.json");
    const md = buildOverviewMd(plan, "260505-0-tidy-readme");
    expect(md).toContain("Bump version and tidy README");
    expect(md).toContain("| 01 ");
  });

  it("valid_plan_sequential renders sequential blocked_by chain", () => {
    const plan = loadPlan("valid_plan_sequential.json");
    const md = buildOverviewMd(plan, "260505-0-sequential-refactor");
    expect(md).toContain("| 01 ");
    expect(md).toContain("| 02 ");
    expect(md).toContain("| 03 ");
  });
});
