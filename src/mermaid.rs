//! Mermaid graph text generation from validated topologies.
//!
//! Produces `graph TD` blocks: one per phase for subagents mode, a single graph
//! for team mode. Downstream consumers join with `\n\n` for raw Mermaid output
//! or wrap each in `<div class="mermaid">` for HTML.

use crate::graph::group_by_step;
use crate::types::{Agent, ExecutionMode, Output, Topology};

/// Generates Mermaid graph definition strings from a validated Topology.
/// Returns one graph per phase (subagents) or a single graph (team).
pub fn generate(topology: &Topology) -> Vec<String> {
    match topology.execution_mode {
        ExecutionMode::Subagents => generate_subagents(topology),
        ExecutionMode::Team => generate_team(topology),
    }
}

fn generate_subagents(topology: &Topology) -> Vec<String> {
    let plan = group_by_step(&topology.agents);
    let mut graphs = Vec::new();

    for (_step_num, agents) in &plan.steps {
        let mut lines = vec!["graph TD".to_string()];
        lines.push(emit_class_defs());
        lines.push(main_node_def());

        let mut nodes = Vec::new();
        let mut edges = Vec::new();

        for agent in agents {
            render_agent_tree(agent, &mut nodes, &mut edges);
            edges.push(format!("    main --> {}", escape_id(&agent.id)));
        }

        lines.extend(nodes);
        lines.extend(edges);
        graphs.push(lines.join("\n"));
    }

    graphs
}

fn generate_team(topology: &Topology) -> Vec<String> {
    let mut lines = vec!["graph TD".to_string()];
    lines.push(emit_class_defs());
    lines.push(main_node_def());

    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    nodes.push("    subgraph team[\"team\"]".to_string());

    for agent in &topology.agents {
        render_agent_tree(agent, &mut nodes, &mut edges);
    }

    nodes.push("    end".to_string());

    // main --> each root agent (those with empty blocked_by)
    for agent in &topology.agents {
        if agent.blocked_by.is_empty() {
            edges.push(format!("    main --> {}", escape_id(&agent.id)));
        }
    }

    // blocked_by edges between top-level agents
    for agent in &topology.agents {
        for blocker in &agent.blocked_by {
            edges.push(format!(
                "    {} --> {}",
                escape_id(blocker),
                escape_id(&agent.id)
            ));
        }
    }

    lines.extend(nodes);
    lines.extend(edges);
    vec![lines.join("\n")]
}

fn render_agent_tree(agent: &Agent, nodes: &mut Vec<String>, edges: &mut Vec<String>) {
    nodes.push(node_def(agent));

    if let Some(children) = &agent.agents {
        let is_team = agent.execution_mode == Some(ExecutionMode::Team);

        if is_team {
            nodes.push(format!(
                "    subgraph {}_team[\"{} team\"]",
                escape_id(&agent.id),
                agent.id
            ));
        }

        for child in children {
            render_agent_tree(child, nodes, edges);
        }

        if is_team {
            nodes.push("    end".to_string());
        }

        for child in children {
            if child.blocked_by.is_empty() {
                edges.push(format!(
                    "    {} --> {}",
                    escape_id(&agent.id),
                    escape_id(&child.id)
                ));
            }
            for blocker in &child.blocked_by {
                edges.push(format!(
                    "    {} --> {}",
                    escape_id(blocker),
                    escape_id(&child.id)
                ));
            }
        }
    }
}

fn escape_id(id: &str) -> String {
    id.replace('-', "_")
}

fn node_def(agent: &Agent) -> String {
    let esc = escape_id(&agent.id);
    let class = agent.model.as_str();
    let label = format!("{} ({})", agent.id, class);
    match &agent.output {
        Output::Inline => format!("    {}[\"{}\"]:::{}", esc, label, class),
        Output::File { .. } => format!("    {}([\"{}\"]):::{}", esc, label, class),
    }
}

fn main_node_def() -> String {
    "    main((\"main agent\")):::main".to_string()
}

fn emit_class_defs() -> String {
    [
        "    classDef haiku fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f",
        "    classDef sonnet fill:#dcfce7,stroke:#22c55e,color:#14532d",
        "    classDef opus fill:#ede9fe,stroke:#8b5cf6,color:#3b0764",
        "    classDef main fill:#fef3c7,stroke:#f59e0b,color:#78350f",
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Model, Output};

    fn make_agent(id: &str, model: Model, output: Output, blocked_by: Vec<&str>) -> Agent {
        Agent {
            id: id.into(),
            role: "does stuff".into(),
            model,
            tools: vec![],
            blocked_by: blocked_by.into_iter().map(String::from).collect(),
            background: false,
            output,
            produces: None,
            execution_mode: None,
            agents: None,
        }
    }

    fn make_topology(mode: ExecutionMode, agents: Vec<Agent>) -> Topology {
        Topology {
            task_summary: "test".into(),
            execution_mode: mode,
            agents,
        }
    }

    // ── escape_id ──

    #[test]
    fn escape_id_passthrough() {
        assert_eq!(escape_id("simple"), "simple");
    }

    #[test]
    fn escape_id_hyphens() {
        assert_eq!(escape_id("a-b-c"), "a_b_c");
    }

    // ── node_def ──

    #[test]
    fn node_def_inline_shape() {
        let a = make_agent("builder", Model::Sonnet, Output::Inline, vec![]);
        let def = node_def(&a);
        assert!(def.contains("builder[\"builder (sonnet)\"]:::sonnet"));
    }

    #[test]
    fn node_def_file_shape() {
        let a = make_agent(
            "coder",
            Model::Sonnet,
            Output::File {
                path: "out.rs".into(),
            },
            vec![],
        );
        let def = node_def(&a);
        assert!(def.contains("coder([\"coder (sonnet)\"]):::sonnet"));
    }

    #[test]
    fn node_def_escaped_id_in_mermaid_original_in_label() {
        let a = make_agent("my-agent", Model::Haiku, Output::Inline, vec![]);
        let def = node_def(&a);
        assert!(def.contains("my_agent[\"my-agent (haiku)\"]:::haiku"));
    }

    // ── main_node_def ──

    #[test]
    fn main_node() {
        let def = main_node_def();
        assert!(def.contains("main((\"main agent\")):::main"));
    }

    // ── emit_class_defs ──

    #[test]
    fn class_defs_has_all_four() {
        let defs = emit_class_defs();
        assert!(defs.contains("classDef haiku"));
        assert!(defs.contains("classDef sonnet"));
        assert!(defs.contains("classDef opus"));
        assert!(defs.contains("classDef main"));
    }

    // ── generate: subagents mode ──

    #[test]
    fn subagents_single_step() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, Output::Inline, vec![])],
        );
        assert_eq!(generate(&t).len(), 1);
    }

    #[test]
    fn subagents_two_steps() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("a", Model::Sonnet, Output::Inline, vec![]),
                make_agent("b", Model::Sonnet, Output::Inline, vec!["a"]),
            ],
        );
        assert_eq!(generate(&t).len(), 2);
    }

    #[test]
    fn subagents_main_edges_per_step() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("a", Model::Sonnet, Output::Inline, vec![]),
                make_agent("b", Model::Sonnet, Output::Inline, vec!["a"]),
            ],
        );
        let graphs = generate(&t);
        assert!(graphs[0].contains("main --> a"));
        assert!(!graphs[0].contains("main --> b"));
        assert!(graphs[1].contains("main --> b"));
        assert!(!graphs[1].contains("main --> a"));
    }

    // ── generate: team mode ──

    #[test]
    fn team_single_graph() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("frontend", Model::Sonnet, Output::Inline, vec![]),
                make_agent("backend", Model::Sonnet, Output::Inline, vec![]),
            ],
        );
        assert_eq!(generate(&t).len(), 1);
    }

    #[test]
    fn team_has_subgraph_wrapper() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![make_agent("a", Model::Sonnet, Output::Inline, vec![])],
        );
        let graph = &generate(&t)[0];
        assert!(graph.contains("subgraph team[\"team\"]"));
        assert!(graph.contains("end"));
    }

    #[test]
    fn team_main_edges_only_unblocked() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("frontend", Model::Sonnet, Output::Inline, vec![]),
                make_agent("backend", Model::Sonnet, Output::Inline, vec![]),
                make_agent("integrator", Model::Opus, Output::Inline, vec!["frontend", "backend"]),
            ],
        );
        let graph = &generate(&t)[0];
        assert!(graph.contains("main --> frontend"));
        assert!(graph.contains("main --> backend"));
        assert!(!graph.contains("main --> integrator"));
    }

    #[test]
    fn team_blocked_by_edges() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("frontend", Model::Sonnet, Output::Inline, vec![]),
                make_agent("integrator", Model::Opus, Output::Inline, vec!["frontend"]),
            ],
        );
        let graph = &generate(&t)[0];
        assert!(graph.contains("frontend --> integrator"));
    }

    // ── nested agents ──

    #[test]
    fn nested_team_gets_subgraph() {
        let mut parent = make_agent("parent", Model::Opus, Output::Inline, vec![]);
        parent.execution_mode = Some(ExecutionMode::Team);
        parent.agents = Some(vec![
            make_agent("child-a", Model::Haiku, Output::Inline, vec![]),
        ]);
        let t = make_topology(ExecutionMode::Subagents, vec![parent]);
        let graph = &generate(&t)[0];
        assert!(graph.contains("subgraph parent_team[\"parent team\"]"));
    }

    #[test]
    fn nested_subagents_no_subgraph() {
        let mut parent = make_agent("parent", Model::Opus, Output::Inline, vec![]);
        parent.execution_mode = Some(ExecutionMode::Subagents);
        parent.agents = Some(vec![
            make_agent("child", Model::Haiku, Output::Inline, vec![]),
        ]);
        let t = make_topology(ExecutionMode::Subagents, vec![parent]);
        let graph = &generate(&t)[0];
        assert!(!graph.contains("subgraph parent"));
    }

    #[test]
    fn every_graph_starts_with_graph_td() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("a", Model::Sonnet, Output::Inline, vec![]),
                make_agent("b", Model::Sonnet, Output::Inline, vec!["a"]),
            ],
        );
        for graph in generate(&t) {
            assert!(graph.starts_with("graph TD"));
        }
    }
}
