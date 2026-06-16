import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsePlanJson, type Plan, type Unit } from "../types.js";
import {
  isValidId,
  isValidSlug,
  isValidUnitId,
  validatePlan,
  type ValidationError,
} from "../validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "fixtures");

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
  // The error kind we expect at least one of, or null for "must pass".
  expect: ValidationError["kind"] | null;
}

const expectations: Record<string, FixtureExpectation> = {
  "valid_plan_minimal.json": { expect: null },
  "valid_plan_sequential.json": { expect: null },
  "invalid_plan_bad_slug.json": { expect: "invalid_slug" },
  "invalid_plan_bad_unit_id.json": { expect: "invalid_unit_id_format" },
  "invalid_plan_dangling_blocked_by.json": {
    expect: "unit_blocked_by_not_found",
  },
  "invalid_plan_duplicate_unit_id.json": { expect: "duplicate_unit_id" },
  "invalid_plan_empty_units.json": { expect: "empty_units" },
  "invalid_plan_unit_cycle.json": { expect: "unit_cyclic_dependency" },
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
    });
  }
});
