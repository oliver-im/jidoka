import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parsePlanJson,
  parseTopologyJson,
  type Agent,
  type Plan,
  type Topology,
  type Unit,
} from "../types.js";
import {
  isValidId,
  isValidSlug,
  isValidUnitId,
  validatePlan,
  validateTopology,
  type ValidationError,
} from "../validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");

const minimalAgent = (id: string): Agent => ({
  id,
  role: "does stuff",
  model: "sonnet",
  tools: [],
  blocked_by: [],
  background: false,
  output: { kind: "inline" },
});

const minimalTopology = (agents: Agent[]): Topology => ({
  task_summary: "Test task",
  execution_mode: "subagents",
  agents,
});

const minimalUnit = (id: string): Unit => ({
  id,
  title: `title for ${id}`,
  summary: `summary for ${id}`,
  blocked_by: [],
  body_markdown: "",
});

const minimalPlan = (units: Unit[]): Plan => ({
  task_summary: "test plan",
  slug: "test-plan",
  units,
});

const has = (errors: ValidationError[], kind: ValidationError["kind"]) =>
  errors.some((e) => e.kind === kind);

describe("isValidId", () => {
  it.each(["foo", "a-b", "a_b", "A1", "a"])("accepts %s", (id) => {
    expect(isValidId(id)).toBe(true);
  });
  it.each(["", "a b", "a.b", "a/b", "a@b"])("rejects %s", (id) => {
    expect(isValidId(id)).toBe(false);
  });
});

describe("isValidSlug", () => {
  it.each(["plan-dirs-pivot", "a", "foo123", "12-34"])(
    "accepts %s",
    (s) => expect(isValidSlug(s)).toBe(true),
  );
  it("rejects bad shapes", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("Bad")).toBe(false);
    expect(isValidSlug("a b")).toBe(false);
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("a-")).toBe(false);
    expect(isValidSlug("a_b")).toBe(false);
    expect(isValidSlug("a".repeat(61))).toBe(false);
  });
});

describe("isValidUnitId", () => {
  it.each(["01-housekeeping", "99-end", "00-zero", "12-multi-word-slug"])(
    "accepts %s",
    (id) => expect(isValidUnitId(id)).toBe(true),
  );
  it("rejects bad shapes", () => {
    expect(isValidUnitId("")).toBe(false);
    expect(isValidUnitId("1-foo")).toBe(false);
    expect(isValidUnitId("100-foo")).toBe(false);
    expect(isValidUnitId("01_foo")).toBe(false);
    expect(isValidUnitId("01-")).toBe(false);
    expect(isValidUnitId("01-Foo")).toBe(false);
    expect(isValidUnitId("ab-foo")).toBe(false);
  });
});

describe("validateTopology rules", () => {
  it("rule 2: empty task_summary", () => {
    const t = { ...minimalTopology([minimalAgent("a")]), task_summary: "" };
    expect(has(validateTopology(t), "empty_task_summary")).toBe(true);
  });

  it("rule 4: empty agents", () => {
    const t = minimalTopology([]);
    expect(has(validateTopology(t), "empty_agents")).toBe(true);
  });

  it("rule 5: invalid agent id", () => {
    const t = minimalTopology([minimalAgent("bad id")]);
    expect(has(validateTopology(t), "invalid_agent_id")).toBe(true);
  });

  it("rule 6: duplicate ids same level", () => {
    const t = minimalTopology([minimalAgent("dup"), minimalAgent("dup")]);
    expect(has(validateTopology(t), "duplicate_agent_id")).toBe(true);
  });

  it("rule 6: duplicate ids across nesting", () => {
    const parent = { ...minimalAgent("parent"), agents: [minimalAgent("dup")] };
    const t = minimalTopology([minimalAgent("dup"), parent]);
    expect(has(validateTopology(t), "duplicate_agent_id")).toBe(true);
  });

  it("rule 7: empty role", () => {
    const a = { ...minimalAgent("a"), role: "" };
    expect(has(validateTopology(minimalTopology([a])), "empty_role")).toBe(
      true,
    );
  });

  it("rule 15: empty nested agents array", () => {
    const a = { ...minimalAgent("a"), agents: [] };
    expect(
      has(validateTopology(minimalTopology([a])), "empty_nested_agents"),
    ).toBe(true);
  });

  it("rule 16: blocked_by not found", () => {
    const a = { ...minimalAgent("a"), blocked_by: ["ghost"] };
    expect(
      has(validateTopology(minimalTopology([a])), "blocked_by_not_found"),
    ).toBe(true);
  });

  it("rule 16: blocked_by wrong scope", () => {
    const parent = {
      ...minimalAgent("parent"),
      agents: [minimalAgent("child")],
    };
    const a = { ...minimalAgent("a"), blocked_by: ["child"] };
    expect(
      has(validateTopology(minimalTopology([a, parent])), "blocked_by_not_found"),
    ).toBe(true);
  });

  it("rule 17: self-dependency", () => {
    const a = { ...minimalAgent("a"), blocked_by: ["a"] };
    expect(has(validateTopology(minimalTopology([a])), "self_dependency")).toBe(
      true,
    );
  });

  it("rule 18: 2-cycle", () => {
    const a = { ...minimalAgent("a"), blocked_by: ["b"] };
    const b = { ...minimalAgent("b"), blocked_by: ["a"] };
    expect(
      has(validateTopology(minimalTopology([a, b])), "cyclic_dependency"),
    ).toBe(true);
  });

  it("rule 18: 3-cycle", () => {
    const a = { ...minimalAgent("a"), blocked_by: ["c"] };
    const b = { ...minimalAgent("b"), blocked_by: ["a"] };
    const c = { ...minimalAgent("c"), blocked_by: ["b"] };
    expect(
      has(validateTopology(minimalTopology([a, b, c])), "cyclic_dependency"),
    ).toBe(true);
  });

  it("rejects Mermaid id collision (a-b vs a_b)", () => {
    const errs = validateTopology(
      minimalTopology([minimalAgent("a-b"), minimalAgent("a_b")]),
    );
    expect(has(errs, "mermaid_id_collision")).toBe(true);
  });

  it("rejects Mermaid id collision across nesting", () => {
    const child = minimalAgent("foo_bar");
    const parent = {
      ...minimalAgent("foo-bar"),
      execution_mode: "subagents" as const,
      agents: [child],
    };
    const errs = validateTopology(minimalTopology([parent]));
    expect(has(errs, "mermaid_id_collision")).toBe(true);
  });

  it("diamond is not a cycle", () => {
    const b = { ...minimalAgent("b"), blocked_by: ["a"] };
    const c = { ...minimalAgent("c"), blocked_by: ["a"] };
    const d = { ...minimalAgent("d"), blocked_by: ["b", "c"] };
    expect(
      validateTopology(minimalTopology([minimalAgent("a"), b, c, d])),
    ).toEqual([]);
  });

  it("collects multiple errors in one pass", () => {
    const a = { ...minimalAgent("bad id"), role: "" };
    const t = { ...minimalTopology([a]), task_summary: "" };
    expect(validateTopology(t).length).toBeGreaterThanOrEqual(3);
  });

  it("valid topology returns no errors", () => {
    const b = { ...minimalAgent("b"), blocked_by: ["a"] };
    expect(validateTopology(minimalTopology([minimalAgent("a"), b]))).toEqual(
      [],
    );
  });

  it("valid nested topology returns no errors", () => {
    const childB = { ...minimalAgent("child_b"), blocked_by: ["child_a"] };
    const parent = {
      ...minimalAgent("parent"),
      execution_mode: "subagents" as const,
      agents: [minimalAgent("child_a"), childB],
    };
    expect(validateTopology(minimalTopology([parent]))).toEqual([]);
  });
});

describe("validatePlan rules", () => {
  it("minimal plan passes", () => {
    expect(validatePlan(minimalPlan([minimalUnit("01-only")]))).toEqual([]);
  });

  it("empty task_summary reported", () => {
    const p = { ...minimalPlan([minimalUnit("01-x")]), task_summary: "" };
    expect(has(validatePlan(p), "empty_task_summary")).toBe(true);
  });

  it("collects multiple errors in one pass", () => {
    const badUnit: Unit = {
      ...minimalUnit("BAD"),
      title: "",
      blocked_by: ["BAD", "ghost"],
    };
    const p: Plan = {
      task_summary: "",
      slug: "Bad Slug",
      units: [badUnit],
    };
    const errs = validatePlan(p);
    expect(errs.length).toBeGreaterThanOrEqual(6);
  });
});

// === Per-fixture parity tests =========================================
//
// For every JSON file in tests/fixtures/, the filename declares the
// expected outcome:
// - valid_*.json — must validate cleanly (zero errors).
// - invalid_<rule>.json — must surface at least one error of the
//   matching kind.

interface FixtureExpectation {
  shape: "topology" | "plan";
  // The error kind we expect at least one of, or null for "must pass".
  expect: ValidationError["kind"] | null;
}

const expectations: Record<string, FixtureExpectation> = {
  "valid_minimal.json": { shape: "topology", expect: null },
  "valid_nested.json": { shape: "topology", expect: null },
  "valid_team.json": { shape: "topology", expect: null },
  "valid_plan_minimal.json": { shape: "plan", expect: null },
  "valid_plan_sequential.json": { shape: "plan", expect: null },
  "valid_plan_with_topology.json": { shape: "plan", expect: null },
  "invalid_bad_id.json": { shape: "topology", expect: "invalid_agent_id" },
  "invalid_blocked_by_not_found.json": {
    shape: "topology",
    expect: "blocked_by_not_found",
  },
  "invalid_cycle.json": { shape: "topology", expect: "cyclic_dependency" },
  "invalid_duplicate_id.json": {
    shape: "topology",
    expect: "duplicate_agent_id",
  },
  "invalid_empty_agents.json": { shape: "topology", expect: "empty_agents" },
  "invalid_empty_nested_agents.json": {
    shape: "topology",
    expect: "empty_nested_agents",
  },
  "invalid_empty_role.json": { shape: "topology", expect: "empty_role" },
  "invalid_empty_task_summary.json": {
    shape: "topology",
    expect: "empty_task_summary",
  },
  "invalid_self_dep.json": { shape: "topology", expect: "self_dependency" },
  "invalid_plan_bad_slug.json": { shape: "plan", expect: "invalid_slug" },
  "invalid_plan_bad_unit_id.json": {
    shape: "plan",
    expect: "invalid_unit_id_format",
  },
  "invalid_plan_dangling_blocked_by.json": {
    shape: "plan",
    expect: "unit_blocked_by_not_found",
  },
  "invalid_plan_duplicate_unit_id.json": {
    shape: "plan",
    expect: "duplicate_unit_id",
  },
  "invalid_plan_empty_units.json": { shape: "plan", expect: "empty_units" },
  "invalid_plan_unit_cycle.json": {
    shape: "plan",
    expect: "unit_cyclic_dependency",
  },
};

describe("fixture parity", () => {
  const fixtureFiles = readdirSync(fixturesDir).filter((f) =>
    f.endsWith(".json"),
  );

  it("every fixture has an expectation", () => {
    for (const f of fixtureFiles) {
      expect(expectations[f], `expectation missing for ${f}`).toBeDefined();
    }
  });

  for (const [fixture, exp] of Object.entries(expectations)) {
    it(`${fixture}: ${exp.expect ?? "passes"}`, () => {
      const path = join(fixturesDir, fixture);
      const json = readFileSync(path, "utf8");

      if (exp.shape === "topology") {
        const parsed = parseTopologyJson(json);
        expect(parsed.ok, `parse failed: ${parsed.ok ? "" : parsed.error}`)
          .toBe(true);
        if (!parsed.ok) return;
        const errs = validateTopology(parsed.value);
        if (exp.expect === null) {
          expect(errs).toEqual([]);
        } else {
          expect(has(errs, exp.expect), `missing ${exp.expect} in ${JSON.stringify(errs)}`).toBe(true);
        }
      } else {
        const parsed = parsePlanJson(json);
        expect(parsed.ok, `parse failed: ${parsed.ok ? "" : parsed.error}`)
          .toBe(true);
        if (!parsed.ok) return;
        const errs = validatePlan(parsed.value);
        if (exp.expect === null) {
          expect(errs).toEqual([]);
        } else {
          expect(has(errs, exp.expect), `missing ${exp.expect} in ${JSON.stringify(errs)}`).toBe(true);
        }
      }
    });
  }
});
