import { describe, expect, it } from "vitest";
import { parsePlanJson, unitSchema } from "../types.js";

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

  it("parses agents_involved", () => {
    const u = unitSchema.parse(minimal({ agents_involved: ["main", "rev"] }));
    expect(u.agents_involved).toEqual(["main", "rev"]);
  });
});

describe("parsePlanJson", () => {
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
