import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parsePlanJson, type Plan, type Unit } from "../types.js";
import {
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

const has = (errors: ValidationError[], kind: ValidationError["kind"]) =>
  errors.some((e) => e.kind === kind);

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
  });
  it("accepts the 60-char maximum and rejects 61", () => {
    expect(isValidSlug("a".repeat(60))).toBe(true);
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
    // The self-reference is reported both as a self-dependency and as a cycle.
    expect(errs.map((e) => e.kind).sort()).toEqual([
      "empty_task_summary",
      "empty_unit_title",
      "invalid_slug",
      "invalid_unit_id_format",
      "unit_blocked_by_not_found",
      "unit_cyclic_dependency",
      "unit_self_dependency",
    ]);
  });
});

// === Per-fixture rule tests ============================================
//
// Each invalid_<rule>.json fixture must surface at least one error of the
// matching kind. Rules already pinned by "collects multiple errors in one
// pass" (slug, unit id format, dangling blocked_by) have no fixture here.

const expectations: Record<string, ValidationError["kind"]> = {
  "invalid_plan_duplicate_unit_id.json": "duplicate_unit_id",
  "invalid_plan_empty_units.json": "empty_units",
  "invalid_plan_unit_cycle.json": "unit_cyclic_dependency",
};

describe("fixture parity", () => {
  for (const [fixture, kind] of Object.entries(expectations)) {
    it(`${fixture}: ${kind}`, () => {
      const json = readFileSync(join(fixturesDir, fixture), "utf8");
      const parsed = parsePlanJson(json);
      expect(parsed.ok, `parse failed: ${parsed.ok ? "" : parsed.error}`)
        .toBe(true);
      if (!parsed.ok) return;
      const errs = validatePlan(parsed.value);
      expect(has(errs, kind), `missing ${kind} in ${JSON.stringify(errs)}`).toBe(true);
    });
  }
});
