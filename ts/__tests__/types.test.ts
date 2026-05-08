import { describe, expect, it } from "vitest";
import {
  agentSchema,
  executionModeSchema,
  modelSchema,
  outputSchema,
  parsePlanJson,
  parseTopologyJson,
  planSchema,
  serializeOutput,
  unitSchema,
} from "../types.js";

describe("Output", () => {
  it("deserializes inline", () => {
    const v = outputSchema.parse("inline");
    expect(v).toEqual({ kind: "inline" });
  });

  it("deserializes file object", () => {
    const v = outputSchema.parse({ file: "out.md" });
    expect(v).toEqual({ kind: "file", path: "out.md" });
  });

  it("rejects bad string literal", () => {
    expect(() => outputSchema.parse("other")).toThrow();
  });

  it("rejects empty file path", () => {
    expect(() => outputSchema.parse({ file: "" })).toThrow();
  });

  it("rejects null", () => {
    expect(() => outputSchema.parse(null)).toThrow();
  });

  it("rejects number", () => {
    expect(() => outputSchema.parse(42)).toThrow();
  });

  it("rejects missing file key", () => {
    expect(() => outputSchema.parse({ path: "out.md" })).toThrow();
  });

  it("rejects extra keys", () => {
    expect(() =>
      outputSchema.parse({ file: "out.md", extra: true }),
    ).toThrow();
  });

  it("serializes inline", () => {
    expect(serializeOutput({ kind: "inline" })).toBe("inline");
  });

  it("serializes file", () => {
    expect(serializeOutput({ kind: "file", path: "out.md" })).toEqual({
      file: "out.md",
    });
  });
});

describe("Model", () => {
  it("accepts known models", () => {
    expect(modelSchema.parse("haiku")).toBe("haiku");
    expect(modelSchema.parse("sonnet")).toBe("sonnet");
    expect(modelSchema.parse("opus")).toBe("opus");
  });

  it("rejects unknown model", () => {
    expect(() => modelSchema.parse("gpt4")).toThrow();
  });
});

describe("ExecutionMode", () => {
  it("accepts known modes", () => {
    expect(executionModeSchema.parse("team")).toBe("team");
    expect(executionModeSchema.parse("subagents")).toBe("subagents");
  });

  it("rejects unknown mode", () => {
    expect(() => executionModeSchema.parse("parallel")).toThrow();
  });
});

describe("Agent", () => {
  it("parses all fields", () => {
    const json = {
      id: "writer",
      role: "Write docs",
      model: "sonnet",
      tools: ["Read", "Write"],
      blocked_by: ["researcher"],
      background: false,
      output: { file: "docs/output.md" },
      produces: "documentation",
      execution_mode: "subagents",
      agents: [
        {
          id: "sub1",
          role: "Sub task",
          model: "haiku",
          tools: [],
          blocked_by: [],
          background: false,
        },
      ],
    };
    const a = agentSchema.parse(json);
    expect(a.id).toBe("writer");
    expect(a.output).toEqual({ kind: "file", path: "docs/output.md" });
    expect(a.produces).toBe("documentation");
    expect(a.execution_mode).toBe("subagents");
    expect(a.agents?.length).toBe(1);
  });

  it("defaults output to inline when omitted", () => {
    const a = agentSchema.parse({
      id: "reader",
      role: "Read",
      model: "haiku",
      tools: ["Read"],
      blocked_by: [],
      background: false,
    });
    expect(a.output).toEqual({ kind: "inline" });
    expect(a.produces).toBeUndefined();
    expect(a.execution_mode).toBeUndefined();
    expect(a.agents).toBeUndefined();
  });

  it("rejects null produces", () => {
    expect(() =>
      agentSchema.parse({
        id: "a",
        role: "test",
        model: "haiku",
        tools: [],
        blocked_by: [],
        background: false,
        produces: null,
      }),
    ).toThrow();
  });

  it("rejects null execution_mode", () => {
    expect(() =>
      agentSchema.parse({
        id: "a",
        role: "test",
        model: "haiku",
        tools: [],
        blocked_by: [],
        background: false,
        execution_mode: null,
      }),
    ).toThrow();
  });

  it("rejects null agents", () => {
    expect(() =>
      agentSchema.parse({
        id: "a",
        role: "test",
        model: "haiku",
        tools: [],
        blocked_by: [],
        background: false,
        agents: null,
      }),
    ).toThrow();
  });
});

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
    expect(u.topology).toBeUndefined();
  });

  it("parses agents_involved", () => {
    const u = unitSchema.parse(minimal({ agents_involved: ["main", "rev"] }));
    expect(u.agents_involved).toEqual(["main", "rev"]);
  });

  it("rejects null agents_involved", () => {
    expect(() => unitSchema.parse(minimal({ agents_involved: null }))).toThrow();
  });

  it("accepts null topology (producer-contract sentinel)", () => {
    const u = unitSchema.parse(minimal({ topology: null }));
    expect(u.topology).toBeUndefined();
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

  it("parses plan with embedded unit topology", () => {
    const json = {
      task_summary: "Build a multi-agent unit",
      slug: "multi-agent",
      units: [
        {
          id: "01-build",
          title: "Build with agents",
          summary: "Dispatch two agents.",
          blocked_by: [],
          review_steps: [],
          body_markdown: "Body.",
          topology: {
            task_summary: "Parallel build",
            execution_mode: "subagents",
            agents: [
              {
                id: "writer",
                role: "Write",
                model: "sonnet",
                tools: [],
                blocked_by: [],
                background: false,
              },
            ],
          },
        },
      ],
    };
    const plan = planSchema.parse(json);
    expect(plan.units[0]!.topology).toBeDefined();
    expect(plan.units[0]!.topology!.agents.length).toBe(1);
  });
});

describe("parseTopologyJson", () => {
  it("returns parse error on invalid JSON", () => {
    const r = parseTopologyJson("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON parse error/);
  });

  it("returns ok on valid topology", () => {
    const r = parseTopologyJson(
      JSON.stringify({
        task_summary: "x",
        execution_mode: "subagents",
        agents: [
          {
            id: "a",
            role: "r",
            model: "haiku",
            tools: [],
            blocked_by: [],
            background: false,
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
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

describe("parseTopologyJson — BOM tolerance", () => {
  it("strips a leading BOM before parsing", () => {
    const json = JSON.stringify({
      task_summary: "x",
      execution_mode: "subagents",
      agents: [
        {
          id: "a",
          role: "r",
          model: "haiku",
          tools: [],
          blocked_by: [],
          background: false,
        },
      ],
    });
    const r = parseTopologyJson("\uFEFF" + json);
    expect(r.ok).toBe(true);
  });
});
