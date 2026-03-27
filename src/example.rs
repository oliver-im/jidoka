// Built-in showcase topology

use crate::types::{Agent, ExecutionMode, Model, Output, Topology};

/// Returns the built-in showcase topology for `--example` mode.
///
/// Demonstrates every feature: both execution modes, all three models,
/// blocked_by chains (3 phases), parallel agents, background tasks,
/// inline and file output, produces field, nested agents with team mode.
pub fn showcase() -> Topology {
    Topology {
        task_summary: "Build and deploy a full-stack dashboard feature".to_string(),
        execution_mode: ExecutionMode::Subagents,
        agents: vec![
            // --- Phase 1: no blockers ---
            Agent {
                id: "research".to_string(),
                role: "Analyze existing codebase and identify integration points".to_string(),
                model: Model::Sonnet,
                tools: vec!["Read".into(), "Grep".into(), "Glob".into()],
                blocked_by: vec![],
                background: false,
                output: Output::Inline,
                produces: Some("codebase analysis".into()),
                execution_mode: None,
                agents: None,
            },
            Agent {
                id: "design".to_string(),
                role: "Design API endpoints and data model".to_string(),
                model: Model::Opus,
                tools: vec!["Read".into(), "Write".into()],
                blocked_by: vec![],
                background: false,
                output: Output::File {
                    path: "docs/api-design.md".into(),
                },
                produces: Some("API design doc".into()),
                execution_mode: None,
                agents: None,
            },
            Agent {
                id: "setup-logging".to_string(),
                role: "Configure observability and structured logging".to_string(),
                model: Model::Haiku,
                tools: vec!["Read".into(), "Edit".into()],
                blocked_by: vec![],
                background: true,
                output: Output::Inline,
                produces: None,
                execution_mode: None,
                agents: None,
            },
            // --- Phase 2: blocked by phase 1 ---
            Agent {
                id: "backend".to_string(),
                role: "Implement backend API and database layer".to_string(),
                model: Model::Sonnet,
                tools: vec!["Read".into(), "Write".into(), "Bash".into()],
                blocked_by: vec!["research".into(), "design".into()],
                background: false,
                output: Output::Inline,
                produces: Some("backend implementation".into()),
                execution_mode: Some(ExecutionMode::Team),
                agents: Some(vec![
                    Agent {
                        id: "api-handler".to_string(),
                        role: "Implement REST endpoint handlers".to_string(),
                        model: Model::Sonnet,
                        tools: vec!["Read".into(), "Write".into()],
                        blocked_by: vec![],
                        background: false,
                        output: Output::File {
                            path: "src/handlers/dashboard.rs".into(),
                        },
                        produces: Some("endpoint handlers".into()),
                        execution_mode: None,
                        agents: None,
                    },
                    Agent {
                        id: "db-migration".to_string(),
                        role: "Create database schema migration".to_string(),
                        model: Model::Haiku,
                        tools: vec!["Write".into()],
                        blocked_by: vec!["api-handler".into()],
                        background: false,
                        output: Output::File {
                            path: "migrations/003_dashboard.sql".into(),
                        },
                        produces: Some("schema migration".into()),
                        execution_mode: None,
                        agents: None,
                    },
                ]),
            },
            Agent {
                id: "frontend".to_string(),
                role: "Implement dashboard UI components".to_string(),
                model: Model::Sonnet,
                tools: vec!["Read".into(), "Write".into(), "Bash".into()],
                blocked_by: vec!["research".into(), "design".into()],
                background: false,
                output: Output::Inline,
                produces: Some("dashboard UI".into()),
                execution_mode: None,
                agents: None,
            },
            // --- Phase 3: blocked by phase 2 ---
            Agent {
                id: "integration".to_string(),
                role: "Run end-to-end tests and verify deployment".to_string(),
                model: Model::Opus,
                tools: vec!["Read".into(), "Bash".into()],
                blocked_by: vec!["backend".into(), "frontend".into()],
                background: false,
                output: Output::Inline,
                produces: Some("test report".into()),
                execution_mode: None,
                agents: None,
            },
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn showcase_is_valid() {
        let topology = showcase();
        crate::validate::validate(&topology).expect("showcase topology should be valid");
    }

    #[test]
    fn showcase_generates_mermaid() {
        let topology = showcase();
        let graphs = crate::mermaid::generate(&topology);
        assert!(!graphs.is_empty(), "should produce at least one graph");
        for graph in &graphs {
            assert!(graph.contains("graph TD"), "each graph should be a TD graph");
        }
    }

    #[test]
    fn showcase_generates_description() {
        let topology = showcase();
        let desc = crate::describe::generate(&topology);
        assert!(!desc.is_empty(), "description should not be empty");
        assert!(
            desc.contains("research"),
            "description should mention agents"
        );
    }

    #[test]
    fn showcase_roundtrips_json() {
        let topology = showcase();
        let json = serde_json::to_string_pretty(&topology).expect("serialize");
        let parsed: Topology = serde_json::from_str(&json).expect("deserialize");
        crate::validate::validate(&parsed).expect("round-tripped topology should be valid");
        assert_eq!(topology.agents.len(), parsed.agents.len());
    }
}
