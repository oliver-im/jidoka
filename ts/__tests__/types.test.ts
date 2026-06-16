import { describe, expect, it } from "vitest";
import { parsePlanJson, planSchema, unitSchema } from "../types.js";

describe("Unit", () => {
  const minimal = (extra: Record<string, unknown> = {}) => ({
    id: "01-foo",
    title: "Foo",
    summary: "Do foo.",
    blocked_by: [],
    review_steps: ["/code-review:code-review"],
    body_markdown: "## Tasks\n\nWrite the foo.",
    ...extra,
  });

  it("parses with optional fields omitted", () => {
    const u = unitSchema.parse(minimal());
    expect(u.id).toBe("01-foo");
    expect(u.agents_involved).toBeUndefined();
  });

  it("parses agents_involved", () => {
    const u = unitSchema.parse(minimal({ agents_involved: ["main", "rev"] }));
    expect(u.agents_involved).toEqual(["main", "rev"]);
  });

  it("rejects null agents_involved", () => {
    expect(() => unitSchema.parse(minimal({ agents_involved: null }))).toThrow();
  });
});

describe("Plan", () => {
  it("round-trips", () => {
    const json = {
      task_summary: "Pivot to plan dirs",
      slug: "plan-dirs-pivot",
      units: [
        {
          id: "01-housekeeping",
          title: "Housekeeping",
          summary: "Bump version, fix docs.",
          blocked_by: [],
          review_steps: ["/code-review:code-review"],
          body_markdown: "## Tasks\n\nDo the work.",
        },
        {
          id: "02-data-model",
          title: "Data model",
          summary: "Add Plan + Unit types.",
          blocked_by: ["01-housekeeping"],
          agents_involved: ["main"],
          review_steps: ["/code-review:code-review", "agent-cli"],
          body_markdown: "## Tasks\n\nLand the types.",
        },
      ],
    };
    const plan = planSchema.parse(json);
    expect(plan.units.length).toBe(2);
    expect(plan.units[1]!.blocked_by).toEqual(["01-housekeeping"]);
  });
});

describe("parsePlanJson", () => {
  it("returns ok on valid plan", () => {
    const r = parsePlanJson(
      JSON.stringify({
        task_summary: "x",
        slug: "x",
        units: [
          {
            id: "01-x",
            title: "X",
            summary: "X.",
            blocked_by: [],
            review_steps: [],
            body_markdown: "",
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it("strips a leading BOM before parsing", () => {
    const json = JSON.stringify({
      task_summary: "x",
      slug: "x",
      units: [
        {
          id: "01-x",
          title: "X",
          summary: "X.",
          blocked_by: [],
          review_steps: [],
          body_markdown: "",
        },
      ],
    });
    const r = parsePlanJson("\uFEFF" + json);
    expect(r.ok).toBe(true);
  });
});
