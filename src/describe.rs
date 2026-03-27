//! Topology overview text generation.
//!
//! Produces a human-readable description with step numbering, phase headers
//! (subagents mode), letter suffixes for parallel agents, and output context
//! lines. Downstream consumer: `html.rs` embeds this in the plan panel.

use crate::graph::group_by_step;
use crate::types::{Agent, ExecutionMode, Output, Topology};

/// Generates a human-readable topology description.
pub fn generate(topology: &Topology) -> String {
    render(
        &topology.agents,
        &topology.execution_mode,
        "the main agent",
        "",
        true,
    )
}

fn render(
    agents: &[Agent],
    execution_mode: &ExecutionMode,
    fallback_target: &str,
    indent: &str,
    show_phase_headers: bool,
) -> String {
    let plan = group_by_step(agents);
    let multi_phase = show_phase_headers
        && *execution_mode == ExecutionMode::Subagents
        && plan.is_multi_step();
    let all_agents = plan.all_agents();

    let mut lines: Vec<String> = Vec::new();
    let mut phase_num = 0usize;

    for (_step_key, step_agents) in &plan.steps {
        phase_num += 1;

        if multi_phase {
            if phase_num > 1 {
                lines.push(String::new());
            }
            lines.push(format!("{}Phase {}", indent, phase_num));
        }

        let step_num = if multi_phase { 1 } else { phase_num };
        let parallel = step_agents.len() > 1;

        for (i, agent) in step_agents.iter().enumerate() {
            let letter = if parallel {
                String::from((b'a' + i as u8) as char)
            } else {
                String::new()
            };

            lines.push(format!(
                "{}{}{}. {} ({})",
                indent,
                step_num,
                letter,
                agent.id,
                agent.model.as_str()
            ));

            lines.push(format!("{}  tools: {}", indent, agent.tools.join(", ")));

            if let Some(children) = &agent.agents {
                let child_mode = agent
                    .execution_mode
                    .as_ref()
                    .unwrap_or(execution_mode);
                let child_indent = format!("{}  ", indent);
                let nested = render(children, child_mode, &agent.id, &child_indent, true);
                lines.push(nested);
            }

            let produces = agent.produces.as_deref().unwrap_or("");
            let context = match &agent.output {
                Output::File { path } => {
                    format!("{}  writes \"{}\" to {}", indent, produces, path)
                }
                Output::Inline => {
                    if *execution_mode == ExecutionMode::Team {
                        let deps = find_dependents(&agent.id, &all_agents);
                        if deps.is_empty() {
                            format!(
                                "{}  returns \"{}\" to {}",
                                indent, produces, fallback_target
                            )
                        } else {
                            format!(
                                "{}  passes \"{}\" to {}",
                                indent, produces, deps.join(", ")
                            )
                        }
                    } else {
                        format!(
                            "{}  returns \"{}\" to {}",
                            indent, produces, fallback_target
                        )
                    }
                }
            };
            lines.push(context);
        }
    }

    lines.join("\n")
}

fn find_dependents<'a>(agent_id: &str, all_agents: &[&'a Agent]) -> Vec<&'a str> {
    all_agents
        .iter()
        .filter(|a| a.blocked_by.iter().any(|b| b == agent_id))
        .map(|a| a.id.as_str())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Model;

    fn make_agent(id: &str, model: Model, tools: Vec<&str>, output: Output, blocked_by: Vec<&str>) -> Agent {
        Agent {
            id: id.into(),
            role: "does stuff".into(),
            model,
            tools: tools.into_iter().map(String::from).collect(),
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

    #[test]
    fn single_agent_basic() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("builder", Model::Sonnet, vec!["Read", "Write"], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert_eq!(
            out,
            "1. builder (sonnet)\n  tools: Read, Write\n  returns \"\" to the main agent"
        );
    }

    #[test]
    fn no_trailing_newline() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Haiku, vec![], Output::Inline, vec![])],
        );
        assert!(!generate(&t).ends_with('\n'));
    }

    #[test]
    fn parallel_agents_get_letters() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("alpha", Model::Haiku, vec![], Output::Inline, vec![]),
                make_agent("beta", Model::Sonnet, vec![], Output::Inline, vec![]),
            ],
        );
        let out = generate(&t);
        assert!(out.contains("1a. alpha (haiku)"));
        assert!(out.contains("1b. beta (sonnet)"));
    }

    #[test]
    fn solo_agent_no_letter() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("solo", Model::Opus, vec![], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert!(out.contains("1. solo (opus)"));
        assert!(!out.contains("1a."));
    }

    #[test]
    fn multi_phase_headers() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("first", Model::Haiku, vec![], Output::Inline, vec![]),
                make_agent("second", Model::Sonnet, vec![], Output::Inline, vec!["first"]),
            ],
        );
        let out = generate(&t);
        assert!(out.contains("Phase 1"));
        assert!(out.contains("Phase 2"));
    }

    #[test]
    fn multi_phase_step_reset() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("first", Model::Haiku, vec![], Output::Inline, vec![]),
                make_agent("second", Model::Sonnet, vec![], Output::Inline, vec!["first"]),
            ],
        );
        let out = generate(&t);
        // Both phases should show step 1, not 1 and 2
        let count = out.lines().filter(|l| l.starts_with("1. ")).count();
        assert_eq!(count, 2);
        assert!(!out.contains("2. "));
    }

    #[test]
    fn single_step_no_phase_header() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("only", Model::Sonnet, vec![], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert!(!out.contains("Phase"));
    }

    #[test]
    fn team_mode_no_phase_header() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("a", Model::Haiku, vec![], Output::Inline, vec![]),
                make_agent("b", Model::Sonnet, vec![], Output::Inline, vec!["a"]),
            ],
        );
        let out = generate(&t);
        assert!(!out.contains("Phase"));
    }

    #[test]
    fn team_passes_to_dependent() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("producer", Model::Sonnet, vec![], Output::Inline, vec![]),
                make_agent("consumer", Model::Opus, vec![], Output::Inline, vec!["producer"]),
            ],
        );
        let out = generate(&t);
        assert!(out.contains("passes \"\" to consumer"));
    }

    #[test]
    fn team_no_dependent_returns() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("producer", Model::Sonnet, vec![], Output::Inline, vec![]),
                make_agent("consumer", Model::Opus, vec![], Output::Inline, vec!["producer"]),
            ],
        );
        let out = generate(&t);
        assert!(out.contains("returns \"\" to the main agent"));
    }

    #[test]
    fn file_output_writes_to() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent(
                "writer",
                Model::Sonnet,
                vec!["Write"],
                Output::File { path: "out.md".into() },
                vec![],
            )],
        );
        let out = generate(&t);
        assert!(out.contains("writes \"\" to out.md"));
    }

    #[test]
    fn produces_none_empty_quotes() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Haiku, vec![], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert!(out.contains("returns \"\" to the main agent"));
    }

    #[test]
    fn produces_some_shows_value() {
        let mut agent = make_agent("a", Model::Haiku, vec![], Output::Inline, vec![]);
        agent.produces = Some("summary".into());
        let t = make_topology(ExecutionMode::Subagents, vec![agent]);
        let out = generate(&t);
        assert!(out.contains("returns \"summary\" to the main agent"));
    }

    #[test]
    fn nested_agents_indented() {
        let child = make_agent("inner", Model::Haiku, vec!["Read"], Output::Inline, vec![]);
        let mut parent = make_agent("outer", Model::Opus, vec!["Write"], Output::Inline, vec![]);
        parent.execution_mode = Some(ExecutionMode::Subagents);
        parent.agents = Some(vec![child]);
        let t = make_topology(ExecutionMode::Subagents, vec![parent]);
        let out = generate(&t);
        assert!(out.contains("  1. inner (haiku)"));
        assert!(out.contains("    tools: Read"));
    }

    #[test]
    fn nested_fallback_is_parent_id() {
        let child = make_agent("inner", Model::Haiku, vec![], Output::Inline, vec![]);
        let mut parent = make_agent("outer", Model::Opus, vec![], Output::Inline, vec![]);
        parent.execution_mode = Some(ExecutionMode::Subagents);
        parent.agents = Some(vec![child]);
        let t = make_topology(ExecutionMode::Subagents, vec![parent]);
        let out = generate(&t);
        assert!(out.contains("returns \"\" to outer"));
    }

    #[test]
    fn tools_comma_separated() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec!["Read", "Write", "Bash"], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert!(out.contains("tools: Read, Write, Bash"));
    }

    #[test]
    fn empty_tools() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec![], Output::Inline, vec![])],
        );
        let out = generate(&t);
        assert!(out.contains("tools: \n") || out.contains("tools: \n") || out.lines().any(|l| l.trim() == "tools:"));
    }

    #[test]
    fn fixture_minimal() {
        let json = std::fs::read_to_string("tests/fixtures/valid_minimal.json").unwrap();
        let t: Topology = serde_json::from_str(&json).unwrap();
        let out = generate(&t);
        assert!(out.contains("1. builder (sonnet)"));
        assert!(out.contains("tools: Read, Write"));
        assert!(!out.contains("Phase"));
    }

    #[test]
    fn fixture_team() {
        let json = std::fs::read_to_string("tests/fixtures/valid_team.json").unwrap();
        let t: Topology = serde_json::from_str(&json).unwrap();
        let out = generate(&t);
        assert!(out.contains("1a. frontend (sonnet)"));
        assert!(out.contains("1b. backend (sonnet)"));
        assert!(out.contains("2. integrator (opus)"));
        assert!(out.contains("passes \"updated UI\" to integrator"));
        assert!(out.contains("passes \"updated API\" to integrator"));
        assert!(!out.contains("Phase"));
    }

    #[test]
    fn fixture_nested() {
        let json = std::fs::read_to_string("tests/fixtures/valid_nested.json").unwrap();
        let t: Topology = serde_json::from_str(&json).unwrap();
        let out = generate(&t);
        assert!(out.contains("Phase 1"));
        assert!(out.contains("Phase 2"));
        assert!(out.contains("1. researcher (haiku)"));
        assert!(out.contains("1. implementer (opus)"));
        assert!(out.contains("  1. coder (sonnet)"));
        assert!(out.contains("    writes \"feature code\" to src/feature.rs"));
        assert!(out.contains("    writes \"test suite\" to tests/feature_test.rs"));
    }
}
