# Visual Design Notes

Reference for the jidoka logo, README images, and future public-facing assets.

## Direction

Jidoka should feel industrial but calm: disciplined, inspectable automation rather
than AI magic. The visual language should borrow lightly from jidoka / andon
manufacturing ideas without becoming nostalgic or literal.

Avoid neon AI gradients, glossy futuristic UI, purple-blue SaaS palettes, and
overly cute illustrations.

## Palette

| Role | Color | Notes |
|---|---|---|
| Background (light) | `#F7F3EA` | warm paper; the light-mode surface |
| Background (dark) | `#16191B` | ink; the dark-mode surface |
| Text | `#1F2528` | ink on paper |
| Text (on dark) | `#F2EFE6` | paper on ink |
| Muted text | `#667174` | captions, tagline |
| Line | `#C9D0CD` | hairlines, tracks |
| **Accent — stop / intervention** | **`#C94B3D`** | the brand accent; the lit/stopped unit |
| Flow / approved | `#3E7C59` | reserved for "passed review" states |
| System / agent | `#4B6F88` | reserved for agent/automation states |
| Paper / cards | `#FFFFFF` | raised surfaces on the light theme |

The accent (`#C94B3D`, "stop") is the single brand color and stays **constant across
light and dark renders** — it reads on both surfaces. Andon red `#C0271B` is the
punchier alternative if the warm red ever feels too soft.

## Logo / Wordmark

The mark is the **reviewable-unit row**: four rounded blocks in a line, one lit in
the accent — the plan split into discrete units, one stopped under review. No kanji.
The wordmark is **`jidoka`**, lowercase, in **Space Grotesk**.

### Lockup

- **Primary (horizontal):** mark to the left of the wordmark. The mark's vertical
  center is aligned to the **wordmark's ink-box center** (not the baseline).
  Gap between mark and wordmark ≈ 0.5× the wordmark cap-height.
- **Stacked:** mark centered above the wordmark — for square contexts (favicon,
  social avatar, GitHub org icon).
- **Mark size:** mark height ≈ the wordmark cap-height (the blocks read about as tall
  as the letter bodies).
- **Clear space:** keep padding ≥ one block-width on all sides of the lockup.

### Type

- **Font:** Space Grotesk.
- **Weight:** 600 (SemiBold) for the wordmark. 500 (Medium) is the calmer alternative.
- **Tracking:** `-0.01em` (very slightly tight). Not looser — geometric sans at
  display size wants normal-to-tight.
- **Case:** lowercase always (`jidoka`, never `Jidoka` / `JIDOKA`).

### Mark geometry (for reproducible art / SVG export)

Drawn in a `0 0 40 40` box:

- Four blocks, `6` wide × `12` tall, `rx 2`, at `x = 4, 13, 22, 31`, `y = 14`.
- Blocks 1, 2, 4 in ink at ~32% opacity (or a muted gray); **block 3 solid accent**
  (`#C94B3D`) — the unit that stopped.
- Optional: a hairline "track" under the row in the line color, to echo
  "units on a track."

### Tagline

`automation with a human touch` — optional descriptor. **Not** used in the current
hero (mark + wordmark only). If reused elsewhere, set it in the muted color, uppercase,
~0.14em letter-spacing, small.

## Rendering & Tooling

The hero is simple enough (four rects + a six-letter word) that it's built directly,
not via an image model: a small HTML lockup with Space Grotesk embedded, rasterized to
PNG with **headless Chrome** — no API key, the real font, a pixel-matched light/dark
pair. The scratch HTML isn't kept in-repo; the **Logo / Wordmark** spec above is the
source of truth, and the method note below is enough to rebuild the PNGs if needed.

### Light / dark — ship both

A PNG bakes in its background and ink, and GitHub renders the README in **both themes
per viewer**. So we render the logo twice and let GitHub swap by theme.

The README also lives inside an Obsidian vault, and Obsidian only resolves **Markdown**
image paths — it does not resolve relative `src`/`srcset` in raw HTML (`<picture>`/`<img>`).
So instead of a `<picture>` element, use Markdown images with GitHub's theme fragments:

```markdown
![jidoka — automation with a human touch](docs/assets/jidoka-hero-light.png#gh-light-mode-only)
![jidoka — automation with a human touch](docs/assets/jidoka-hero-dark.png#gh-dark-mode-only)
```

- **GitHub** honors `#gh-light-mode-only` / `#gh-dark-mode-only` and shows only the
  matching one per theme. **Obsidian** ignores the fragments and shows both stacked —
  acceptable, since the logo is readable there.
- **Light:** background `#F7F3EA`, wordmark/ink `#1F2528`.
- **Dark:** background `#16191B`, wordmark/ink `#F2EFE6`.
- **Accent `#C94B3D` is identical in both** — only background + ink invert.

### Type system for static doc pages (if/when built)

The wordmark font is baked into the logo asset; it is **not** the page font.

| Role | Font | Where |
|---|---|---|
| Wordmark | Space Grotesk | baked into the logo SVG/PNG only |
| Headings | Space Grotesk *(brand echo)* or Inter | `h1`–`h3` |
| Body / UI | Inter | all running text |
| Code | a mono (JetBrains / IBM Plex) | code blocks |

Never set body copy in the wordmark face.

### How the hero was rendered

Method, for rebuilding if the logo ever changes:

- Lay out the mark (the four-block SVG above) and the `jidoka` wordmark (Space Grotesk
  600) in a small HTML page, in light and dark variants.
- Render the **mark and the wordmark separately** with headless Chrome at 2×, and trim
  each to its own ink box. Compositing them separately and aligning their **vertical
  centers** is what keeps the mark centered — rendering the row as one piece mis-centers
  it, because the `j` descender drags the wordmark's bounding box downward.
- Composite the two side-by-side (gap ≈ 34px × 2) on the theme background with uniform
  padding (~120×84 device px), giving the ~1409×383 pair.

Embed Space Grotesk 600 (from Google Fonts) as base64 in the page to avoid a web-font
load race during the headless render.

## README Images

### Hero (wordmark lockup) — `jidoka-hero-{light,dark}.png`

The wordmark lockup above, as a wide banner. Light + dark shipped as two PNGs, swapped
on GitHub via `#gh-light-mode-only` / `#gh-dark-mode-only`. This replaces the earlier
busy AI-diagram hero.

### Metaphor image (optional / future)

A more editorial, human-feeling illustration teaching the metaphor: a software
assembly line / loom / rail where plan units move through automation, one unit
stopped under an andon-like red signal with a human reviewer nearby — automation
proceeds, detects risk, stops for human judgment, resumes once understood. Same
palette. Not currently in the README.

### Solution / Workflow image — `jidoka-workflow-{light,dark}.png`

**One** flat, horizontal diagram (not an image-model illustration): two panes — each a
true **50% half** of the canvas — joined by an `each unit →` arrow that floats on the
center seam (absolutely positioned, so it eats into neither half). No global "workflow"
kicker, no bottom footer.

- **Left — the plan dir:** the title is *"Split the plan"*. Its subtitle is *"The native
  plan output, split into reviewable units + overview & progress"*.
  Directly **under that subtitle** sits the capture note — *"a **PreToolUse** hook on
  `ExitPlanMode` intercepts the native plan and materializes the dir below —
  automatically, before you approve"*, set as a left-border callout (this is the hook
  explanation; it lives here in the left column, not as a bottom footer). Below it, the
  materialized directory drawn as an actual **file
  tree** (CSS-drawn elbow + spine + ticks, monospace), with the path annotated so it
  reads as illustrative — `docs/exec-plans/active/` tagged *configurable root* and
  `260619-1-feature/` tagged *an example plan*. `overview.md` (*plan summary*) /
  `progress.md` (*live status*) are plain; the `0N-…md` unit files carry the
  **reviewable-unit row** motif, and the lit accent block **cascades** across them —
  1st on `01`, 2nd on `02`, 3rd on `03` — an andon scan down the units. A faint
  `… up to N units` row closes the list. A one-line legend reads
  `▦ a reviewable unit · one gate each`.
- **Right — the gate:** the title is *"A gate after every unit"*. Its subtitle begins with
  *"Stop, review, approve..."* and explains optional reset before the next
  execution begins. Below it, one unit's lifecycle appears as a **vertical** pill flow —
  `a unit → review → approve → reset` — each with a small caption (`reviewable,
  executable, testable units` · `use other agents or models for review` · `see the
  overview, findings to steer the direction if needed` · `optionally compact or clear
  before the next execution`). Accent = review (stop), green = approve, blue = reset.

Built by `docs/assets/build-jidoka-workflow.py`: flat HTML/CSS with Space Grotesk
(titles) + Inter (body/subtitles) embedded as base64, rasterized at 2× with headless
Chrome to a pixel-matched light/dark pair (1100×506 logical → 2200×1012), swapped on
GitHub via `#gh-light-mode-only` / `#gh-dark-mode-only`. Rebuild with:

```bash
python3 docs/assets/build-jidoka-workflow.py
```

No image model, no API key. This replaces the earlier image-model diagram (busy with
stock logos and clip-art file icons) and the intermediate split / single-slide attempts.
Keep it as **one** image, left column (title + capture note + tree) beside right gate:
real tree connectors, an example-flagged path, the andon cascade on the unit files, short
labels, gate states as small pills — don't split it into separate images.

## Style Keywords

- modern editorial technical illustration
- clean linework, flat, not glossy
- muted warm palette, subtle paper grain
- restrained, not futuristic, not cyberpunk
- no neon AI gradients, no purple-blue SaaS palette
