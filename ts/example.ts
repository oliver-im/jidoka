import type { Agent, Topology } from "./types.js";

const a = (overrides: Partial<Agent> & Pick<Agent, "id" | "role">): Agent => ({
  model: "sonnet",
  tools: [],
  blocked_by: [],
  background: false,
  output: { kind: "inline" },
  ...overrides,
});

/** Built-in showcase topology demonstrating every feature. */
export function showcase(): Topology {
  return {
    task_summary: "Build and deploy a full-stack dashboard feature",
    execution_mode: "subagents",
    agents: [
      a({
        id: "research",
        role: "Analyze existing codebase and identify integration points",
        model: "sonnet",
        tools: ["Read", "Grep", "Glob"],
        produces: "codebase analysis",
      }),
      a({
        id: "design",
        role: "Design API endpoints and data model",
        model: "opus",
        tools: ["Read", "Write"],
        output: { kind: "file", path: "docs/api-design.md" },
        produces: "API design doc",
      }),
      a({
        id: "setup-logging",
        role: "Configure observability and structured logging",
        model: "haiku",
        tools: ["Read", "Edit"],
        background: true,
      }),
      a({
        id: "backend",
        role: "Implement backend API and database layer",
        model: "sonnet",
        tools: ["Read", "Write", "Bash"],
        blocked_by: ["research", "design"],
        produces: "backend implementation",
        execution_mode: "team",
        agents: [
          a({
            id: "api-handler",
            role: "Implement REST endpoint handlers",
            tools: ["Read", "Write"],
            output: { kind: "file", path: "src/handlers/dashboard.rs" },
            produces: "endpoint handlers",
          }),
          a({
            id: "db-migration",
            role: "Create database schema migration",
            model: "haiku",
            tools: ["Write"],
            blocked_by: ["api-handler"],
            output: { kind: "file", path: "migrations/003_dashboard.sql" },
            produces: "schema migration",
          }),
        ],
      }),
      a({
        id: "frontend",
        role: "Implement dashboard UI components",
        tools: ["Read", "Write", "Bash"],
        blocked_by: ["research", "design"],
        produces: "dashboard UI",
      }),
      a({
        id: "integration",
        role: "Run end-to-end tests and verify deployment",
        model: "opus",
        tools: ["Read", "Bash"],
        blocked_by: ["backend", "frontend"],
        produces: "test report",
      }),
    ],
  };
}
