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

    expect(plan.task_summary).toBe("Refactor jidoka pipeline to plan-md");
    expect(plan.slug).toBe("refactor-jidoka-pipeline-to-plan-md");
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
      // The parser no longer emits review info; the materializer attaches
      // the resolved review list at materialize time using the user's config.
      expect(u.review).toBeUndefined();
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

  it("keeps a `topology` fence inline as prose (no longer extracted)", () => {
    const md = [
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```topology",
      `{ "task_summary": "x" }`,
      "```",
      "",
    ].join("\n");
    const plan = parse(md);
    expect(plan.units[0]!.body_markdown).toBe(
      "```topology\n{ \"task_summary\": \"x\" }\n```",
    );
    expect(validatePlan(plan)).toEqual([]);
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

  it("unwraps a 5-tick wrapper and preserves an internal 3-tick fence", () => {
    const wrapped = [
      "`````markdown",
      "# T",
      "",
      "## Unit 01: Foo",
      "",
      "Summary.",
      "",
      "```json",
      `{"x": 1}`,
      "```",
      "`````",
    ].join("\n");
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("T");
    expect(plan.units[0]!.body_markdown).toBe("```json\n{\"x\": 1}\n```");
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

  it("preserves an internal fence when unwrapping", () => {
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
      "```json",
      `{"x": 1}`,
      "```",
      "```",
    ].join("\n");
    const plan = parse(wrapped);
    expect(plan.task_summary).toBe("T");
    expect(plan.units[0]!.body_markdown).toBe("Body.\n\n```json\n{\"x\": 1}\n```");
  });
});
