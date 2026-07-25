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
import { parsePlanJson, type Plan, type Unit } from "../types.js";

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
    // the last-unit exception renders unconditionally — with no plan_review it
    // degrades to "work through" the surface-and-ask sentence below
    expect(md).toContain("**Exception — the last unit:**");
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
    expect(md).toContain("in the same session as the last unit");
    // no git workflow on this plan: the close-out scope must not promise a
    // merge the document never defines, and must spell out the archive move
    // itself (no rendered section defines it here)
    expect(md).toContain(
      "covers only the close-out (moving the plan dir to `completed/`), nothing else",
    );
    expect(md).not.toContain("(archive, merge)");
    expect(md).toContain("- [ ] `/code-review:code-review`");
    expect(md).toContain("- [ ] `/codex:adversarial-review`");
  });

  it("renders a configured pre-execution review", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: ["/jidoka:pre-plan-review"],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("## Pre-execution review");
    expect(md).toContain("before starting Unit 01");
    expect(md).toContain("does not roll straight into Unit 01");
    expect(md).toContain("- [ ] `/jidoka:pre-plan-review`");
  });

  // codex plan-level review [HIGH]: a print-mode pre_review template must not be
  // framed as agent-run — the section must route by mode, not say "the agent runs
  // the step(s) below" (which would auto-run a print step, bypassing the human gate).
  it("routes a print-mode pre_review step to surface-and-stop, not agent-run", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: [{ run: "codex exec {plan_dir}", mode: "print" }],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("Follow each step's routing");
    expect(md).toContain("surface the command and stop");
    expect(md).toContain("- [ ] `codex exec {plan_dir}` — **print**");
    // Must NOT unconditionally claim the agent runs every step.
    expect(md).not.toContain("runs the step(s) below");
  });

  // codex plan-level review [MED]: the plan-level block must point at the composer
  // (which injects jidoka's own prompt), not tell the agent to run the vehicle
  // template directly (which would skip the prompt injection).
  it("frames plan-level review as the composer driving the vehicle, not direct execution", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      plan_review: [{ run: "codex exec {diff_range}", mode: "print" }],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md).toContain("## Plan-level review");
    expect(md).toContain("/jidoka:plan-review-prompt");
    expect(md).toContain("injects jidoka's own plan-level");
    expect(md).toContain("don't run the vehicle(s) below directly");
    // The vehicle still renders as a checklist entry the composer will drive.
    expect(md).toContain("- [ ] `codex exec {diff_range}` — **print**");
  });

  // terminal-unit stop gate: the configured branch must carry the operator gate
  // the empty branch always had. Without it, one blanket go-ahead lets plan
  // review → fixes → archive → merge run as a single motion and the operator
  // first sees the findings after `main` has moved.
  it("gates the close-out behind a stop after the plan-level review converges", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      plan_review: ["/codex:adversarial-review"],
      git_workflow: true,
    };
    const md = buildProgressMd(plan, "260505-0-x");
    // same-session coupling + the committed precondition + the stop, in the
    // plan-review preamble
    expect(md).toContain("in the same session as the last unit");
    expect(md).toContain("once its review lands and is committed");
    expect(md).toContain("then **stop**");
    // the go-ahead scope, pinned with its preamble-unique lead-in — the Notes
    // bullet carries the same clause, so a bare clause pin couldn't catch the
    // preamble dropping it
    expect(md).toContain(
      "The operator's next go-ahead covers only the close-out (archive), nothing else.",
    );
    // the Notes carry the matching last-unit exception, its clause wired
    // through the template slot
    expect(md).toContain("**Exception — the last unit:**");
    expect(md).toContain(
      "The go-ahead that follows covers only the close-out (archive), nothing else.",
    );
    // the git-workflow close-out chain is conditioned on that go-ahead
    expect(md).toContain("**At the end, on the operator's close-out go-ahead**");
  });

  it("renders template review steps with a print/exec mode badge", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: [{ run: "echo plan {plan_dir}", mode: "print" }],
      plan_review: [{ run: "codex exec --base {base} {diff_range}", mode: "exec" }],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    // print template: run text verbatim (placeholder intact) + print badge.
    expect(md).toContain("- [ ] `echo plan {plan_dir}` — **print**");
    expect(md).toContain("surface this command and stop for the operator");
    // exec template: run text verbatim + exec badge.
    expect(md).toContain(
      "- [ ] `codex exec --base {base} {diff_range}` — **exec**",
    );
    expect(md).toContain("the resuming agent runs this via the Bash tool");
    // a templated step with placeholders carries the substitution note.
    expect(md).toContain("the **resuming agent** substitutes their placeholders");
  });

  it("renders a unit template review step with its mode badge", () => {
    const u: Unit = {
      ...minimalUnit("01-x"),
      review: [{ run: "agent -p --mode ask {focus}", mode: "exec" }],
    };
    const md = buildUnitMd(u, false);
    expect(md).toContain(
      "- [ ] `agent -p --mode ask {focus}` — **exec**",
    );
  });

  it("omits the substitution note for a template with no placeholders (exec)", () => {
    const u: Unit = {
      ...minimalUnit("01-x"),
      review: [{ run: "codex exec review", mode: "exec" }],
    };
    const md = buildUnitMd(u, false);
    expect(md).toContain("- [ ] `codex exec review` — **exec**");
    expect(md).not.toContain("substitutes their placeholders");
  });

  it("omits the substitution note for a template with no placeholders (print)", () => {
    const u: Unit = {
      ...minimalUnit("01-x"),
      review: [{ run: "codex exec review", mode: "print" }],
    };
    const md = buildUnitMd(u, false);
    expect(md).toContain("- [ ] `codex exec review` — **print**");
    expect(md).not.toContain("substitutes their placeholders");
  });

  it("does not mistake literal command braces for a pending placeholder", () => {
    const u: Unit = {
      ...minimalUnit("01-x"),
      review: [{ run: "git log | awk '{print $1}'", mode: "exec" }],
    };
    const md = buildUnitMd(u, false);
    // `{print $1}` is not one of the known stage-scoped placeholders.
    expect(md).not.toContain("substitutes their placeholders");
  });

  it("keeps the code span well-formed when a template run contains a backtick", () => {
    const u: Unit = {
      ...minimalUnit("01-x"),
      review: [{ run: "codex exec --base `git mb`", mode: "exec" }],
    };
    const md = buildUnitMd(u, false);
    // GFM escapes a literal backtick by widening the fence to `` and padding.
    expect(md).toContain("`` codex exec --base `git mb` ``");
  });

  it("escapes a pipe in a template run so the overview table stays 4-column", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [
        { ...minimalUnit("01-x"), review: [{ run: "cmd | grep x", mode: "exec" }] },
      ],
    };
    const md = buildOverviewMd(plan, "260505-0-x");
    expect(md).toContain("cmd \\| grep x");
    // No raw unescaped pipe from the run leaks into the cell.
    expect(md).not.toContain("| cmd | grep x |");
  });

  it("orders Pre-execution review before Plan-level review", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      pre_review: ["/jidoka:pre-plan-review"],
      plan_review: ["/codex:adversarial-review"],
    };
    const md = buildProgressMd(plan, "260505-0-x");
    expect(md.indexOf("## Pre-execution review")).toBeLessThan(
      md.indexOf("## Plan-level review"),
    );
  });

  it("renders the git workflow block with the plan id when enabled", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
      git_workflow: true,
    };
    const md = buildProgressMd(plan, "260607-3-foo");
    expect(md).toContain("## Git workflow");
    expect(md).toContain("worktrees/260607-3-foo/");
    expect(md).toContain("plan/260607-3-foo");
    // the close-out chain stops at the archive commit: the go-ahead does not
    // buy a merge or a push, and this block renders into repos whose `main` is
    // protected, so it must name no landing mechanism at all
    expect(md).toContain("commit on the plan branch — **and stop there.**");
    expect(md).toContain("Publishing is a separate, explicitly-requested step");
    expect(md).not.toContain("git merge --no-ff");
    expect(md).not.toContain("git checkout main");
  });

  it("omits the git workflow block when disabled or absent", () => {
    const plan: Plan = {
      task_summary: "x",
      slug: "x",
      units: [minimalUnit("01-prep")],
    };
    expect(buildProgressMd(plan, "260607-3-foo")).not.toContain(
      "## Git workflow",
    );
  });
});

describe("buildUnitMd", () => {
  it("renders title, blocked_by, agents", () => {
    const md = buildUnitMd(minimalUnit("01-foo"), false);
    expect(md).toContain("# Unit 01 — Title for 01-foo");
    expect(md).toContain("**Blocked by:** none");
    expect(md).toContain("**Agents involved:** main only");
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
    expect(buildUnitMd(u, false)).toContain("**Blocked by:** 01-a, 01-b");
  });

  it("renders agents_involved when present", () => {
    const u: Unit = { ...minimalUnit("01-x"), agents_involved: ["a", "b"] };
    expect(buildUnitMd(u, false)).toContain("**Agents involved:** a, b");
  });

  it("emits no review steps placeholder when review list is empty", () => {
    const u: Unit = { ...minimalUnit("01-x"), review: [] };
    expect(buildUnitMd(u, false)).toContain("- [ ] _No review steps configured._");
  });

  it("emits no review steps placeholder when review is absent", () => {
    const u: Unit = { ...minimalUnit("01-x") };
    delete u.review;
    expect(buildUnitMd(u, false)).toContain("- [ ] _No review steps configured._");
  });
});

describe("buildUnitMd re-review-to-convergence note", () => {
  it("appends the note when review steps exist and reReview is on", () => {
    const md = buildUnitMd(minimalUnit("01-foo"), true);
    expect(md).toContain("**Re-review to convergence.**");
    expect(md).toContain('middle "should-fix" tier');
  });

  it("omits the note when reReview is off", () => {
    expect(buildUnitMd(minimalUnit("01-foo"), false)).not.toContain(
      "Re-review to convergence.",
    );
  });

  it("omits the note when the unit has no review steps, even if reReview is on", () => {
    const empty: Unit = { ...minimalUnit("01-x"), review: [] };
    expect(buildUnitMd(empty, true)).not.toContain("Re-review to convergence.");
    const absent: Unit = { ...minimalUnit("01-x") };
    delete absent.review;
    expect(buildUnitMd(absent, true)).not.toContain("Re-review to convergence.");
  });
});

describe("buildProgressMd re-review-to-convergence note", () => {
  const planWith = (over: Partial<Plan>): Plan => ({
    task_summary: "x",
    slug: "x",
    units: [minimalUnit("01-prep")],
    ...over,
  });

  it("appends the note inside the plan-level block when plan_review is set and the flag is on", () => {
    const md = buildProgressMd(
      planWith({
        plan_review: ["/codex:adversarial-review"],
        review_reconverge: true,
      }),
      "260709-0-x",
    );
    expect(md).toContain("**Re-review to convergence.**");
    expect(md.indexOf("**Re-review to convergence.**")).toBeGreaterThan(
      md.indexOf("## Plan-level review"),
    );
    // with the note present, the preamble may demand a convergence verdict
    expect(md).toContain("the convergence verdict");
  });

  it("omits the note when the flag is off", () => {
    const md = buildProgressMd(
      planWith({
        plan_review: ["/codex:adversarial-review"],
        review_reconverge: false,
      }),
      "260709-0-x",
    );
    expect(md).not.toContain("Re-review to convergence.");
    // the flag-off render must not demand "convergence" anywhere — the note
    // that defines it is the thing the operator turned off
    expect(md).not.toContain("convergence");
  });

  it("omits the note when no plan_review is configured", () => {
    const md = buildProgressMd(
      planWith({ plan_review: [], review_reconverge: true }),
      "260709-0-x",
    );
    expect(md).not.toContain("Re-review to convergence.");
  });

  it("never adds the note to the pre-execution review block", () => {
    // pre_review present, plan_review empty, flag on: the only block that could
    // emit the note is pre-execution — and it must not.
    const md = buildProgressMd(
      planWith({
        pre_review: ["/jidoka:pre-plan-review"],
        plan_review: [],
        review_reconverge: true,
      }),
      "260709-0-x",
    );
    expect(md).toContain("## Pre-execution review");
    expect(md).not.toContain("Re-review to convergence.");
  });
});

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
