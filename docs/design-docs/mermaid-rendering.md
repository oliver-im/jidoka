# Diagram Rendering Analysis (March 2026)

Whether Mermaid is the right rendering backend for jidoka, or whether an alternative produces better results for this workload.

## Workload Profile

The renderer generates directed acyclic graphs showing agent topology:

- **Graph types:** Hub-and-spoke (subagents mode, one graph per phase) and single DAG (team mode)
- **Node shapes:** Rectangle (inline output), stadium/pill (file output), double circle (main agent)
- **Styling:** 4-color scheme based on model (haiku=blue, sonnet=green, opus=purple, main=amber)
- **Subgraphs:** Communication boundaries for team mode
- **Typical scale:** 3–15 agents per topology, 1–5 nesting levels
- **Output:** Static SVG in a self-contained HTML file, opened by `open` command
- **No interactivity needed:** Read-only visualization, no drag/zoom/edit
- **Generation method:** the renderer produces diagram text → browser renders SVG client-side

## Candidates Evaluated

Eight rendering approaches, evaluated against jidoka's specific requirements.

### Eliminated

**Kroki** — Server-side only. Requires Docker, HTTP requests for every render. Cannot produce self-contained HTML files. Eliminated.

**Excalidraw** — Hard React dependency (`react >=17.0.2`). Bundle ~2 MB+. Hand-drawn-only aesthetic (roughjs) — not configurable. No text DSL for programmatic generation. Designed for interactive editor, not CLI output. Eliminated.

**vis-network** — No true compound nodes (only visual grouping). Canvas rendering, not SVG. 645 KB bundle. Missing the subgraph/container feature jidoka needs for team communication boundaries. Eliminated.

**ELK.js** — Layout-only engine (computes coordinates, no rendering). Requires 200–400 lines of SVG generation code on top. 1,610 KB bundle. EPL-2.0 license (copyleft for modifications). Excellent layout quality, but the integration cost is unjustifiable when complete rendering solutions exist at similar or smaller bundle sizes. Eliminated.

**dagre-d3-es** — This is what Mermaid uses internally. Using it directly gives the same layout quality as Mermaid with more control, but loses the text DSL, themes, and ecosystem. Only 4 basic shapes (rect, circle, ellipse, diamond). Not an upgrade over Mermaid — a sidegrade with less convenience. Eliminated.

### The Three-Way Race

| | Mermaid | Graphviz WASM | D2 |
|---|---|---|---|
| Version | 11.13.0 (stable) | 1.21.2 (stable) | 0.7.1 (pre-1.0) |
| Browser bundle | ~2.9 MB (843 KB gzip) | 778 KB (609 KB gzip) | ~8.2 MB (WASM inline) |
| Rendering | SVG (JS-native) | SVG (C++ via WASM) | SVG (Go via WASM) |
| Layout engine | dagre (layered) | dot, neato, fdp, circo + 6 more | dagre, ELK (TALA paid, not in WASM) |
| Layout quality | Good | Best (gold standard) | Good (dagre/ELK only in browser) |
| Node shapes | 30+ (v11.3.0+ expanded) | 50+ (full DOT) | 18+ (no stadium, no double circle) |
| Stadium/pill | Yes (`([text])`) | No native equivalent | No |
| Double circle | Yes (`(((text)))`) | Yes (`peripheries=2`) | No |
| Per-node styling | classDef + inline style | DOT attributes (fill, color, style) | Classes + per-node attributes |
| Subgraphs | Yes (with direction bug) | Yes (cluster_* prefix) | Yes (arbitrary nesting) |
| Text DSL | Flowchart syntax | DOT language | D2 language |
| DSL readability | High | Moderate | High |
| Hyphen handling | Broken in IDs (workaround: underscores) | Works natively | Works natively |
| GitHub rendering | Yes (native since 2022) | No | No |
| npm weekly downloads | ~2.25M | N/A (via @hpcc-js) | ~1.9K |
| GitHub stars | 87K | N/A | 23K |
| License | MIT | Apache-2.0 | MPL-2.0 |
| Dependencies | Many | Zero | Zero |

## Deep Comparison

### Mermaid (Current Choice)

**Strengths:**

1. **All needed shapes exist natively.** Stadium (`([text])`), double circle (`(((text)))`), and rectangle (`[text]`) are first-class. No workarounds needed for jidoka's visual language.
2. **classDef maps directly to the 4-color model scheme.** Define `classDef haiku fill:#dbeafe,stroke:#3b82f6`, apply with `:::haiku`. Clean, minimal code generation.
3. **Text DSL is the most readable.** `A --> B` is immediately understood. The `--mermaid` CLI flag produces human-readable, debuggable output.
4. **GitHub ecosystem.** Mermaid text pasted in issues, PRs, or READMEs renders natively. This is a distribution advantage — topology diagrams become portable.
5. **CDN loading is one line.** `<script type="module">` with the esm.min.mjs URL. No WASM initialization, no async loading dance.
6. **Actively maintained** with monthly releases. 87K GitHub stars. MIT license.

**Weaknesses:**

1. **Largest bundle of the three.** 2.9 MB UMD (843 KB gzip) embeds dagre, D3, and all diagram type parsers. jidoka only uses flowcharts — the other 15 diagram types are dead weight.
2. **dagre layout quality is mediocre.** For complex graphs, dagre produces suboptimal edge routing, excessive whitespace, and poor rank assignment compared to Graphviz's dot algorithm. At jidoka's typical scale (3–15 agents) this is rarely visible, but edge cases exist.
3. **Subgraph direction bug.** If any node inside a subgraph links to a node outside it, the subgraph's direction declaration is silently ignored. This affects team mode where team agents connect to the external main agent.
4. **Hyphen workaround.** Agent IDs with hyphens must be escaped to underscores in Mermaid node IDs. Already handled in the spec, but it's a footgun.
5. **Reserved word "end".** The word `end` in a node label breaks the parser. Must capitalize.

### Graphviz WASM (@hpcc-js/wasm-graphviz)

**Strengths:**

1. **Smallest bundle.** 778 KB (609 KB gzip) — 3.7x smaller than Mermaid. Contains the full Graphviz C++ engine compiled to WASM, zstd-compressed and embedded. Zero dependencies.
2. **Gold-standard layout quality.** Graphviz's `dot` algorithm is the benchmark for directed graph layout. Optimal rank assignment, sophisticated edge routing, minimal edge crossings. Every other tool's DAG layout is measured against it.
3. **Richest shape vocabulary.** 50+ shapes including all DOT classics. Double circle via `peripheries=2`. No native stadium/pill, but `shape=Mrecord` (rounded rectangle) or `shape=box, style=rounded` are visually distinct alternatives.
4. **Robust subgraph support.** `subgraph cluster_team { ... }` creates visual containers with no direction bugs. Battle-tested for decades.
5. **No ID escaping issues.** DOT handles hyphens, underscores, and quoted identifiers natively.
6. **Actively maintained.** v1.21.2 released March 2026. Stable 1.x API.

**Weaknesses:**

1. **No stadium/pill shape.** Graphviz has no native equivalent of Mermaid's `([text])`. The closest is `shape=box, style=rounded` (rounded rectangle) or `shape=oval` (ellipse). The visual distinction between "inline output" and "file output" would need a different signifier — rounded rectangle, fill pattern, or icon.
2. **DOT syntax is less readable.** `a -> b [label="depends on"]` vs Mermaid's `a --> b`. For the `--mermaid` (now `--dot`?) CLI flag, the output is functional but less elegant.
3. **No GitHub rendering.** DOT diagrams don't render in GitHub Markdown. Topology text pasted in issues/PRs would be raw text.
4. **Async initialization required.** `await Graphviz.load()` before first render. Minor, but adds initialization code to the HTML template.
5. **Static SVG only.** No built-in themes, no click handlers, no animations. Fine for jidoka (static visualization), but no path to interactivity without additional libraries.

### D2 (@terrastruct/d2)

**Strengths:**

1. **Purpose-built for software architecture diagrams.** The D2 language was designed for exactly this kind of visualization — architecture, topology, system diagrams.
2. **Richest styling model.** CSS-like classes, per-node fill/stroke/opacity/border-radius/shadow/gradients, animated edges. The class system is more powerful than Mermaid's classDef.
3. **Clean nesting syntax.** `parent.child` or block syntax. Arbitrary depth, no subgraph quirks.
4. **Good text DSL.** `x -> y` is clean. Labels, connections, containers are all concise.

**Weaknesses:**

1. **Largest bundle by far.** 8.2 MB — the full Go compiler output compiled to WASM. 2.8x larger than Mermaid, 10.5x larger than Graphviz WASM. For a CLI tool generating self-contained HTML, this is significant.
2. **Missing required shapes.** No stadium/pill. No double circle. jidoka's visual language cannot be expressed without workarounds.
3. **Best layout engine is proprietary and unavailable in browser.** TALA — the reason D2 produces good architecture diagrams — is a paid, closed-source binary that cannot run in the WASM build. Browser-side D2 uses dagre or ELK, which is the same layout quality as Mermaid.
4. **Pre-1.0.** Both the CLI (v0.7.1) and the JS wrapper (v0.1.33) are pre-1.0. API may change. The JS wrapper has been public for ~14 months.
5. **Tiny adoption.** ~1.9K npm weekly downloads vs Mermaid's 2.25M. Limited community, limited battle-testing.
6. **No GitHub rendering.** No native platform support anywhere.

## Dimension-by-Dimension Winner

| Dimension | Winner | Why |
|---|---|---|
| Bundle size | Graphviz WASM (778 KB) | 3.7x smaller than Mermaid, 10.5x smaller than D2 |
| Layout quality | Graphviz WASM (dot) | Gold standard for DAG layout, decades of optimization |
| Node shapes (jidoka needs) | Mermaid | Only one with native stadium + double circle |
| Styling (classDef) | D2 | Most powerful class/cascade system |
| Text DSL readability | Mermaid | Flowchart syntax is the most human-readable |
| Subgraph reliability | Graphviz WASM | No direction override bugs |
| ID handling | Graphviz WASM / D2 (tie) | Both handle hyphens natively |
| Ecosystem / portability | Mermaid | GitHub, GitLab, Notion, Obsidian, 50+ integrations |
| Stability / maturity | Mermaid / Graphviz (tie) | Both stable, actively maintained, large communities |
| WASM maturity | Graphviz WASM | 1.x stable API, D2 is 0.1.x |

## Verdict

**Mermaid is the right choice for V1.**

Not because it's the best rendering engine — Graphviz produces better layouts and ships at 25% of the bundle size. Mermaid wins because it's the only option where jidoka's visual language works without compromises:

1. **Stadium/pill shape exists natively.** This is the most important differentiator. jidoka uses stadium vs rectangle to distinguish file output from inline output. Neither Graphviz nor D2 have this shape. Graphviz's `shape=box, style=rounded` is a rounded rectangle, not a stadium — the visual distinction is weaker. Losing this shape means redesigning the visual language, which is not worth the bundle size savings.

2. **Double circle exists natively.** `(((main agent)))` is a one-liner. Graphviz can do this with `peripheries=2`, so this alone isn't decisive — but it's additive.

3. **classDef maps directly to the spec.** The 4-color model scheme in the developer guide uses classDef syntax. Graphviz can achieve the same with DOT attributes (`fillcolor`, `color`, `style=filled`), but the spec would need rewriting.

4. **Text DSL is debuggable.** The `--mermaid` flag outputs human-readable text. `A(["file-writer (sonnet)"]) --> B["validator (haiku)"]` tells you what's happening. DOT is functional but less immediately legible.

5. **GitHub rendering is free distribution.** If someone pastes Mermaid text from `--mermaid` output into a GitHub issue, it renders. This is a meaningful but non-essential benefit.

**The known Mermaid limitations have documented workarounds:**

- Hyphens → underscore escaping (already in spec)
- Reserved word "end" → capitalize in labels
- Subgraph direction override → structure graph to avoid cross-boundary links where possible, accept the limitation where not
- dagre layout quality → acceptable at jidoka's typical scale (3–15 agents)

## D2 Assessment Revised

The [developer guide](../developer-guide.md) states: "D2 is the strongest candidate for a Mermaid alternative." This assessment was made without knowing D2's browser bundle size.

**Now that the data is in:** D2's browser bundle is 8.2 MB — 2.8x larger than Mermaid. The TALA layout engine (D2's main differentiator for architecture diagrams) is proprietary and unavailable in the WASM build. Without TALA, D2 uses dagre — the same layout engine as Mermaid. D2 also lacks stadium and double circle shapes.

**Revised assessment:** D2 is not the strongest Mermaid alternative. It is larger, less mature, missing required shapes, and its layout advantage (TALA) doesn't exist in the browser. Graphviz WASM is the stronger alternative.

## Upgrade Path

If Mermaid's limitations become blocking (poor layout at scale, subgraph bugs, bundle size concerns), the strongest upgrade is **Graphviz WASM**:

- 3.7x smaller bundle (778 KB vs 2.9 MB)
- Superior layout quality (dot algorithm)
- No ID escaping issues
- Stable 1.x API, actively maintained, zero dependencies

The cost of switching:

- Redesign the visual language to replace stadium with rounded rectangle or add a different file-output signifier (border style, icon, label prefix)
- Rewrite `ts/mermaid.ts` → `ts/graphviz.ts` (generate DOT text instead of Mermaid text)
- Replace the `--mermaid` flag with `--dot` or `--graph`
- Lose GitHub Markdown rendering of raw graph text
- Update HTML template: replace `mermaid.initialize()` with `await Graphviz.load()` + SVG injection

The renderer architecture is already designed for this swap — the graph text generation module is isolated from validation, description, and HTML assembly.

## Cytoscape.js: The Interactive Option

If jidoka ever needs interactivity (drag nodes, zoom, click-to-inspect), **Cytoscape.js** (434 KB, MIT, zero deps) is the clear choice. It has compound nodes for subgraphs, 25+ shapes, rich CSS-like styling, and the `cytoscape-dagre` extension for hierarchical layout. The tradeoff is Canvas rendering (not SVG) and a programmatic API (not text DSL). This would be a larger architectural change than swapping text-based backends.

## Sources

- [Mermaid.js documentation](https://mermaid.js.org)
- [Mermaid GitHub](https://github.com/mermaid-js/mermaid) — 87K stars, v11.13.0
- [@hpcc-js/wasm-graphviz](https://github.com/hpcc-systems/hpcc-js-wasm) — v1.21.2, Apache-2.0
- [D2 language](https://d2lang.com) — v0.7.1, MPL-2.0
- [@terrastruct/d2 npm](https://www.npmjs.com/package/@terrastruct/d2) — v0.1.33, ~8.2 MB browser bundle
- [D2 playground](https://github.com/terrastruct/d2-playground) — client-side rendering proof
- [ELK.js](https://github.com/kieler/elkjs) — v0.11.1, EPL-2.0
- [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) — v3.33.1, MIT
- [vis-network](https://github.com/visjs/vis-network) — v10.0.2, Apache/MIT
- [Kroki](https://github.com/yuzutech/kroki) — server-side only
- [Excalidraw](https://github.com/excalidraw/excalidraw) — v0.18.0, React dependency
- [dagre-d3-es](https://www.npmjs.com/package/dagre-d3-es) — v7.0.14, Mermaid's internal layout engine
- [Mermaid expanded shapes (v11.3.0)](https://mermaid.js.org/syntax/flowchart.html)
- [Graphviz node shapes](https://graphviz.org/doc/info/shapes.html)
