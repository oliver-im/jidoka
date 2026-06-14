# Browser Debugging MCP Servers

Research date: 2026-03-22

## Context

jidoka renders self-contained HTML files (Mermaid diagrams, CSS layout, client-side JS). We need a way to debug these from Claude Code — verify rendering, check console errors, inspect layout, confirm Mermaid initialization.

## Contenders

### Chrome DevTools MCP (Google) — Recommended

- **Repo:** ChromeDevTools/chrome-devtools-mcp — 30.7k stars
- **License:** Apache 2.0
- **Maintained:** Very active (v0.1.0 Sep 2025 → v0.20.3 Mar 2026)
- **Connection:** Chrome DevTools Protocol via Puppeteer. Three modes: auto-connect (Chrome 144+), `--browserUrl` (existing instance), fresh launch (default).
- **Tools:** 29 across 6 categories — input (9), navigation (6), emulation (2), performance (4), network (2), debugging (6). Slim mode (`--slim`) reduces to 3 tools (~3k tokens vs ~18k).
- **Unique strengths:** Performance tracing, Lighthouse audits, memory snapshots, network inspection, console log analysis. No other MCP server offers this.
- **Setup:** `claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest --slim`
- **Known issues:** Memory leak in `--autoConnect` mode (~13 MB/min, issue #1192). Connection drops in sessions >30 min. Chrome-only.

### Playwright MCP (Microsoft)

- **Repo:** microsoft/playwright-mcp — 29.4k stars
- **License:** Apache 2.0
- **Maintained:** Very active (498 commits)
- **Connection:** Launches Chromium or connects to existing browser via extension mode. Multi-browser: Chrome, Firefox, WebKit.
- **Tools:** 21 tools, ~13.7k tokens. Key differentiator: **accessibility snapshots** (structured DOM tree) instead of screenshots — no vision model needed.
- **Best for:** Cross-browser automation, form-filling, testing workflows.
- **Setup:** `claude mcp add playwright -- npx @playwright/mcp@latest`

### Browser Use CLI

- **Repo:** browser-use/browser-use — 82k stars (framework; CLI is a subset)
- **License:** MIT
- **Maintained:** Very active (v0.12.3 Mar 2026)
- **Connection:** Rust CLI → Node.js daemon → CDP. Migrated from Playwright to raw CDP for lower latency.
- **Tools:** ~20 direct control tools + autonomous agent mode (LLM-in-the-loop for multi-step tasks).
- **Dependencies:** Python 3.11+, Chrome, LLM API keys for agent mode.
- **Best for:** Autonomous multi-step web workflows where the agent figures out browser actions from natural language.
- **Why not for us:** Agent mode doubles LLM costs. Autonomous browsing is overkill for debugging known HTML files. Heavier dependency chain (Python + daemon process).

## Also Evaluated

| Tool | Stars | Verdict |
|------|-------|---------|
| BrowserMCP (Chrome extension) | 6.1k | Controls your real browser session. Good for authenticated sites, not relevant for local temp HTML files. |
| ExecuteAutomation Playwright | 5.3k | Predates Microsoft's official server. 143 device presets but otherwise superseded. |
| Browserbase MCP | 3.2k | Cloud-hosted browsers. Paid API key required. Not needed for local debugging. |
| Selenium MCP | 376 | Legacy ecosystem wrapper. No advantage over Playwright. |
| Firecrawl MCP | ~1.8k | Web scraping (URL → markdown), not browser automation. Complementary, not competing. |
| Anthropic Puppeteer MCP | — | Deprecated. Chrome DevTools MCP absorbed this role. |
| BrowserTools MCP (AgentDeskAI) | 7.1k | Project is no longer active. |

## Decision

**Chrome DevTools MCP** for debugging (console, network, performance, screenshots).
**Playwright MCP** for automation/testing (cross-browser, accessibility snapshots).
**Skip Browser Use CLI** — solves a different problem (autonomous web agents) at higher cost and complexity.

### Complementary use

The two recommended servers cover different needs:

| Need | Tool |
|------|------|
| "Why is the page blank?" | Chrome DevTools — `list_console_messages`, `evaluate_script` |
| "Is the Mermaid diagram rendering?" | Chrome DevTools — `take_screenshot`, `evaluate_script` |
| "Does the layout work at 768px?" | Chrome DevTools — `emulate`, `resize_page` |
| "Run Lighthouse on the output" | Chrome DevTools — `lighthouse_audit` |
| "Click through the theme toggle" | Playwright — `browser_click`, `browser_snapshot` |
| "Test in Firefox/Safari" | Playwright — multi-browser support |
| "Fill a form and submit" | Playwright — `browser_fill_form` |
