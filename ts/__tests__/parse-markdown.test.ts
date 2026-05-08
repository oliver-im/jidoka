import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePlanMarkdown } from "../parse-markdown.js";
import { validatePlan } from "../validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "fixtures");

function parse(md: string) {
  const r = parsePlanMarkdown(md);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.value;
}

describe("parsePlanMarkdown — fixtures", () => {
  it("round-trips plan.md and passes validatePlan", () => {
    const md = readFileSync(join(FIXTURES, "plan.md"), "utf8");
    const plan = parse(md);

    expect(plan.task_summary).toBe("Refactor planview pipeline to plan-md");
    expect(plan.slug).toBe("refactor-planview-pipeline-to-plan-md");
    expect(plan.units.length).toBe(7);

    const ids = plan.units.map((u) => u.id);
    expect(ids).toEqual([
      "01-markdown-parser",
      "02-hook-reads-tool-input-plan",
      "03-cli-trim",
      "04-delete-topology-renderer",
      "05-trim-plan-types",
      "06-skill-emits-markdown",
      "07-docs",
    ]);

    expect(plan.units[0]!.blocked_by).toEqual([]);
    expect(plan.units[1]!.blocked_by).toEqual(["01-markdown-parser"]);
    expect(plan.units[6]!.blocked_by).toEqual(["06-skill-emits-markdown"]);

    for (const u of plan.units) {
      expect(u.review_steps).toEqual(["/code-review:code-review"]);
    }

    expect(plan.units[0]!.summary).toBe(
      "Add `ts/parse-markdown.ts` that takes a markdown plan and returns a `Plan`. Tolerate `## Step` and bare-number heading variants.",
    );
    expect(plan.units[0]!.body_markdown.startsWith("### Tasks")).toBe(true);
    expect(plan.units[0]!.body_markdown).toContain("### Acceptance");

    expect(validatePlan(plan)).toEqual([]);
  });

  it("returns an error for bad.md (whitespace-only)", () => {
    const md = readFileSync(join(FIXTURES, "bad.md"), "utf8");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no plan title/);
  });
});

describe("parsePlanMarkdown — title", () => {
  it("uses the first H1 as task_summary", () => {
    const plan = parse("# My plan\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(plan.task_summary).toBe("My plan");
    expect(plan.slug).toBe("my-plan");
  });

  it("falls back to the first non-empty non-heading line", () => {
    const plan = parse("Refactor the auth flow.\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(plan.task_summary).toBe("Refactor the auth flow.");
    expect(plan.slug).toBe("refactor-the-auth-flow");
  });

  it("strips a leading-blank-lines preamble before the H1", () => {
    const plan = parse("\n\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(plan.task_summary).toBe("My plan");
  });

  it("errors when no title precedes the first unit heading", () => {
    const r = parsePlanMarkdown("## Unit 01: Foo\n\nSummary.\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no plan title/);
  });

  it("skips heading-style lines in the title fallback (no H1, prose follows)", () => {
    const md = "## Goal\n\nReal title here.\n\n## Unit 01: Foo\n\nSummary.\n";
    const plan = parse(md);
    expect(plan.task_summary).toBe("Real title here.");
  });

  it("errors when only headings precede the first unit (no H1, no prose)", () => {
    const r = parsePlanMarkdown("## Goal\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no plan title/);
  });

  it("errors when the title has no alphanumeric content", () => {
    const r = parsePlanMarkdown("# !!!\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cannot derive slug/);
  });

  it("truncates a long title to 60 chars when slugifying", () => {
    const longTitle = "a".repeat(100);
    const plan = parse(`# ${longTitle}\n\n## Unit 01: Foo\n\nSummary.\n`);
    expect(plan.slug.length).toBe(60);
    expect(plan.slug).toBe("a".repeat(60));
  });
});

describe("parsePlanMarkdown — unit headings (canonical + tolerant)", () => {
  it("accepts canonical `## Unit NN: title`", () => {
    const plan = parse("# T\n\n## Unit 01: Alpha\n\nA.\n\n## Unit 02: Beta\n\nB.\n");
    expect(plan.units.map((u) => u.title)).toEqual(["Alpha", "Beta"]);
  });

  it("accepts single-digit `## Unit 1: …`", () => {
    const plan = parse("# T\n\n## Unit 1: Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
    expect(plan.units[0]!.id).toBe("01-alpha");
  });

  it("accepts `## Step NN: …`", () => {
    const plan = parse("# T\n\n## Step 01: Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
  });

  it("accepts bare `## NN: title`", () => {
    const plan = parse("# T\n\n## 01: Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
  });

  it("accepts `## NN. title`", () => {
    const plan = parse("# T\n\n## 01. Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
  });

  it("accepts `## NN - title`", () => {
    const plan = parse("# T\n\n## 01 - Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
  });

  it("accepts em-dash separator `## NN — title`", () => {
    const plan = parse("# T\n\n## 01 — Alpha\n\nA.\n");
    expect(plan.units[0]!.title).toBe("Alpha");
  });

  it("is case-insensitive on `Unit`/`Step`", () => {
    const plan = parse("# T\n\n## UNIT 01: Alpha\n\nA.\n\n## step 02: Beta\n\nB.\n");
    expect(plan.units.map((u) => u.title)).toEqual(["Alpha", "Beta"]);
  });

  it("ignores non-unit H2 headings (e.g. `## Goal`, `## Tasks`)", () => {
    const md = "# T\n\n## Goal\n\nSomething.\n\n## Unit 01: Real\n\nReal summary.\n";
    const plan = parse(md);
    expect(plan.units.length).toBe(1);
    expect(plan.units[0]!.title).toBe("Real");
  });

  it("renumbers gaps in the user's numbering (01, 03 → 01, 02)", () => {
    const plan = parse("# T\n\n## Unit 01: A\n\nA.\n\n## Unit 03: B\n\nB.\n");
    expect(plan.units.map((u) => u.id)).toEqual(["01-a", "02-b"]);
    expect(plan.units[1]!.blocked_by).toEqual(["01-a"]);
  });

  it("errors when no units are present", () => {
    const r = parsePlanMarkdown("# Just a title\n\nNo units here.\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no unit headings/);
  });
});

describe("parsePlanMarkdown — unit body", () => {
  it("treats the first paragraph as summary, rest as body_markdown", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Short summary line.",
      "",
      "### Tasks",
      "",
      "- Do thing",
      "- Do other thing",
      "",
    ].join("\n");
    const plan = parse(md);
    const u = plan.units[0]!;
    expect(u.summary).toBe("Short summary line.");
    expect(u.body_markdown).toBe("### Tasks\n\n- Do thing\n- Do other thing");
  });

  it("joins a multi-line first paragraph into a single summary string", () => {
    const md = "# T\n\n## Unit 01: Foo\n\nLine one\nline two\nline three.\n\nBody.\n";
    const plan = parse(md);
    expect(plan.units[0]!.summary).toBe("Line one line two line three.");
    expect(plan.units[0]!.body_markdown).toBe("Body.");
  });

  it("leaves body_markdown empty when only a summary is present", () => {
    const plan = parse("# T\n\n## Unit 01: Foo\n\nJust the summary.\n");
    expect(plan.units[0]!.summary).toBe("Just the summary.");
    expect(plan.units[0]!.body_markdown).toBe("");
  });

  it("preserves blank lines inside the body", () => {
    const md = "# T\n\n## Unit 01: Foo\n\nSummary.\n\nBody para 1.\n\nBody para 2.\n";
    const plan = parse(md);
    expect(plan.units[0]!.body_markdown).toBe("Body para 1.\n\nBody para 2.");
  });

  it("handles CRLF line endings", () => {
    const md = "# T\r\n\r\n## Unit 01: Foo\r\n\r\nSummary.\r\n\r\nBody.\r\n";
    const plan = parse(md);
    expect(plan.units[0]!.summary).toBe("Summary.");
    expect(plan.units[0]!.body_markdown).toBe("Body.");
  });

  it("derives unit id from the unit title slug, not the heading number", () => {
    const plan = parse("# T\n\n## Unit 01: Add `tool_input` Parser!\n\nS.\n");
    expect(plan.units[0]!.id).toMatch(/^01-add-tool-input-parser$/);
  });

  it("falls back to NN-unit when title slugifies to empty", () => {
    const plan = parse("# T\n\n## Unit 01: !!!\n\nS.\n");
    expect(plan.units[0]!.id).toBe("01-unit");
  });
});

const MIN_TOPOLOGY_JSON = `{
  "task_summary": "Build X",
  "execution_mode": "subagents",
  "agents": [
    {
      "id": "a",
      "role": "Do A",
      "model": "sonnet",
      "tools": [],
      "blocked_by": [],
      "background": false
    }
  ]
}`;

describe("parsePlanMarkdown — topology fence extraction", () => {
  it("extracts a single topology fence and strips it from body_markdown", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "Body prose.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    const u = plan.units[0]!;
    expect(u.topology).toBeDefined();
    expect(u.topology!.task_summary).toBe("Build X");
    expect(u.topology!.execution_mode).toBe("subagents");
    expect(u.topology!.agents).toHaveLength(1);
    expect(u.topology!.agents[0]!.id).toBe("a");
    expect(u.body_markdown).toBe("Body prose.");
    expect(validatePlan(plan)).toEqual([]);
  });

  it("populates topology independently on multiple units", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Sum 1.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
      "## Unit 02: Bar",
      "",
      "Sum 2.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON.replace(`"task_summary": "Build X"`, `"task_summary": "Build Y"`),
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology?.task_summary).toBe("Build X");
    expect(plan.units[1]!.topology?.task_summary).toBe("Build Y");
    expect(plan.units[0]!.body_markdown).toBe("");
    expect(plan.units[1]!.body_markdown).toBe("");
    expect(validatePlan(plan)).toEqual([]);
  });

  it("accepts a fence positioned before prose", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
      "Body after fence.",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeDefined();
    expect(plan.units[0]!.body_markdown).toBe("Body after fence.");
  });

  it("preserves prose on either side when fence is sandwiched", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "Prose before.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
      "Prose after.",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeDefined();
    expect(plan.units[0]!.body_markdown).toBe("Prose before.\n\nProse after.");
  });

  it("leaves topology undefined when no fence is present (Unit 01 regression)", () => {
    const md = "# T\n\n## Unit 01: Foo\n\nSummary.\n\nBody.\n";
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeUndefined();
    expect(plan.units[0]!.body_markdown).toBe("Body.");
  });

  it("does not strip non-topology fences (e.g. ```json) from the body", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```json",
      `{"x": 1}`,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeUndefined();
    expect(plan.units[0]!.body_markdown).toBe("```json\n{\"x\": 1}\n```");
  });

  it("errors with units[k].topology prefix on malformed JSON", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: First",
      "",
      "S1.",
      "",
      "## Unit 02: Second",
      "",
      "S2.",
      "",
      "```topology",
      "{ not valid json",
      "```",
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/^units\[1\]\.topology: /);
      expect(r.error).toMatch(/JSON parse error/);
    }
  });

  it("errors with units[k].topology prefix on schema-invalid topology", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      `{"task_summary": "x", "execution_mode": "nope", "agents": []}`,
      "```",
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/^units\[0\]\.topology: /);
      expect(r.error).toMatch(/execution_mode/);
    }
  });

  it("errors on an unterminated topology fence", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      `{"task_summary": "x"}`,
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unterminated topology fence/);
  });

  it("errors when one unit contains two topology fences", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/multiple topology fences/);
  });

  it("does not extract a ```topology line nested inside another fenced block", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```md",
      "Here is a fake topology fence inside an md block:",
      "```topology",
      `{"fake": true}`,
      "```",
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeUndefined();
    expect(plan.units[0]!.body_markdown).toContain("```md");
    expect(plan.units[0]!.body_markdown).toContain("```topology");
  });

  it("retains a non-topology fence in body when it sits next to a topology fence", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```json",
      `{"foo": 1}`,
      "```",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology?.task_summary).toBe("Build X");
    expect(plan.units[0]!.body_markdown).toBe("```json\n{\"foo\": 1}\n```");
  });

  it("errors with units[k].topology prefix on an empty fence body", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      "```",
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^units\[0\]\.topology: JSON parse error/);
  });

  it("preserves leading indentation of the line that follows the stripped fence", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
      "    indented code line",
      "    second line",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeDefined();
    expect(plan.units[0]!.body_markdown).toBe("    indented code line\n    second line");
  });

  it("preserves user-authored multi-blank-line runs elsewhere in the body", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "para1",
      "",
      "",
      "",
      "para2",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology).toBeDefined();
    expect(plan.units[0]!.body_markdown).toBe("para1\n\n\n\npara2");
  });

  it("treats a 4-backtick fence as a balanced non-topology block and detects topology after it", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "````md",
      "Example: ```topology",
      "{fake: true}",
      "```",
      "````",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.topology?.task_summary).toBe("Build X");
    // The 4-backtick fence and its content stay in body verbatim — including
    // the literal ```topology line, which is content, not a fence open.
    expect(plan.units[0]!.body_markdown).toBe(
      "````md\nExample: ```topology\n{fake: true}\n```\n````",
    );
  });

  it("requires the closing fence to have at least as many backticks as the opener", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "````topology",
      MIN_TOPOLOGY_JSON,
      "```", // only 3 backticks — too short to close a 4-backtick opener
      "",
    ].join("\n");
    const r = parsePlanMarkdown(md);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unterminated topology fence/);
  });
});

describe("parsePlanMarkdown — outer markdown fence", () => {
  const RAW = "# My plan\n\n## Unit 01: Foo\n\nSummary.\n";

  it("unwraps a ```markdown wrapper and parses identically to raw", () => {
    const wrapped = "```markdown\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n```\n";
    expect(parse(wrapped)).toEqual(parse(RAW));
  });

  it("unwraps a ``` wrapper with no info string", () => {
    const wrapped = "```\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n```\n";
    expect(parse(wrapped)).toEqual(parse(RAW));
  });

  it("unwraps a 5-tick wrapper and preserves an internal 3-tick topology fence", () => {
    const wrapped = [
      "`````markdown",
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "`````",
    ].join("\n");
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("T");
    expect(plan.units[0]!.topology?.task_summary).toBe("Build X");
    expect(plan.units[0]!.body_markdown).toBe("");
  });

  it("does not unwrap when opener and closer have mismatched tick counts", () => {
    // Opener 3 ticks, closer 4 ticks — closer regex requires exactly 3 at EOF.
    const wrapped = "```markdown\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n````\n";
    // Falls through to the existing extractTitle fallback: the leading ```markdown
    // line becomes the title (the bug this unit defends against). The slug is
    // derived from "markdown".
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("```markdown");
    expect(plan.slug).toBe("markdown");
  });

  it("leaves a non-fenced plan unchanged", () => {
    const plan = parse(RAW);
    expect(plan.task_summary).toBe("My plan");
    expect(plan.slug).toBe("my-plan");
  });

  it("tolerates leading/trailing whitespace around the wrapper", () => {
    const wrapped = "\n\n  ```markdown\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n```  \n\n";
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("My plan");
  });

  it("unwraps a CRLF-encoded ```markdown wrapper", () => {
    const wrapped =
      "```markdown\r\n# My plan\r\n\r\n## Unit 01: Foo\r\n\r\nSummary.\r\n```\r\n";
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("My plan");
    expect(plan.slug).toBe("my-plan");
  });

  it("strips a leading BOM before parsing", () => {
    const plan = parse("\uFEFF# My plan\n\n## Unit 01: Foo\n\nSummary.\n");
    expect(plan.task_summary).toBe("My plan");
    expect(plan.slug).toBe("my-plan");
  });

  it("strips a leading BOM in front of an outer ```markdown wrapper", () => {
    const plan = parse(
      "\uFEFF```markdown\n# My plan\n\n## Unit 01: Foo\n\nSummary.\n```\n",
    );
    expect(plan.task_summary).toBe("My plan");
    expect(plan.slug).toBe("my-plan");
  });

  it("preserves an internal topology fence when unwrapping", () => {
    const wrapped = [
      "```markdown",
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "Body.",
      "",
      "```topology",
      MIN_TOPOLOGY_JSON,
      "```",
      "```",
    ].join("\n");
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("T");
    expect(plan.units[0]!.topology?.task_summary).toBe("Build X");
    expect(plan.units[0]!.body_markdown).toBe("Body.");
  });
});
