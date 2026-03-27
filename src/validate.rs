//! Validation of a parsed [`Topology`] against the 18 rules from the data
//! model spec. Returns **all** errors (not fail-fast) so the caller can
//! display them in one pass.
//!
//! Key design choices:
//! - **Scope-aware dependencies** — `blocked_by` references are checked per
//!   nesting level, not globally (rules 16-18).
//! - **Global ID uniqueness** — agent IDs must be unique across all nesting
//!   levels (rule 6).
//! - **Cycle detection** — DFS with a three-color (white/gray/black) scheme
//!   per scope (rule 18).

use std::collections::{HashMap, HashSet};
use std::fmt;

use crate::types::Topology;

#[derive(Debug)]
pub enum ValidationError {
    EmptyTaskSummary,
    EmptyAgents,
    InvalidAgentId { id: String, path: String },
    DuplicateAgentId { id: String, first_path: String, second_path: String },
    EmptyRole { agent_id: String, path: String },
    EmptyNestedAgents { agent_id: String, path: String },
    BlockedByNotFound { agent_id: String, referenced_id: String, path: String },
    SelfDependency { agent_id: String, path: String },
    CyclicDependency { cycle: Vec<String>, path: String },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EmptyTaskSummary => {
                write!(f, "task_summary must be a non-empty string")
            }
            ValidationError::EmptyAgents => {
                write!(f, "agents must be a non-empty array")
            }
            ValidationError::InvalidAgentId { id, path } => {
                write!(f, "invalid agent id '{}' at {}: must match [a-zA-Z0-9_-]+", id, path)
            }
            ValidationError::DuplicateAgentId { id, first_path, second_path } => {
                write!(f, "duplicate agent id '{}' at {} and {}", id, first_path, second_path)
            }
            ValidationError::EmptyRole { agent_id, path } => {
                write!(f, "agent '{}' at {} has an empty role", agent_id, path)
            }
            ValidationError::EmptyNestedAgents { agent_id, path } => {
                write!(f, "agent '{}' at {} has an empty agents array", agent_id, path)
            }
            ValidationError::BlockedByNotFound { agent_id, referenced_id, path } => {
                write!(
                    f,
                    "agent '{}' at {} references unknown blocked_by id '{}'",
                    agent_id, path, referenced_id
                )
            }
            ValidationError::SelfDependency { agent_id, path } => {
                write!(f, "agent '{}' at {} blocks itself", agent_id, path)
            }
            ValidationError::CyclicDependency { cycle, path } => {
                write!(f, "cyclic dependency at {}: {}", path, cycle.join(" -> "))
            }
        }
    }
}

/// Validates a deserialized Topology and returns all errors found.
pub fn validate(topology: &Topology) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    // Rule 2: Non-empty task_summary
    if topology.task_summary.is_empty() {
        errors.push(ValidationError::EmptyTaskSummary);
    }

    // Rule 4: Non-empty agents array
    if topology.agents.is_empty() {
        errors.push(ValidationError::EmptyAgents);
    }

    // Rules 5-6: ID format and global uniqueness (recursive)
    let mut seen_ids = HashMap::new();
    collect_and_validate_ids(&topology.agents, "agents", &mut seen_ids, &mut errors);

    // Rules 7, 15: Per-agent field validation (recursive)
    validate_agent_fields(&topology.agents, "agents", &mut errors);

    // Rules 16-18: Scope-aware dependency validation (recursive)
    validate_dependencies_in_scope(&topology.agents, "agents", &mut errors);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Rules 5+6: Validate ID format and collect for global uniqueness check.
fn collect_and_validate_ids(
    agents: &[crate::types::Agent],
    path: &str,
    seen: &mut HashMap<String, String>,
    errors: &mut Vec<ValidationError>,
) {
    for (i, agent) in agents.iter().enumerate() {
        let agent_path = format!("{}[{}]", path, i);

        // Rule 5: ID format
        if !is_valid_id(&agent.id) {
            errors.push(ValidationError::InvalidAgentId {
                id: agent.id.clone(),
                path: agent_path.clone(),
            });
        }

        // Rule 6: Global uniqueness
        if let Some(first_path) = seen.get(&agent.id) {
            errors.push(ValidationError::DuplicateAgentId {
                id: agent.id.clone(),
                first_path: first_path.clone(),
                second_path: agent_path.clone(),
            });
        } else {
            seen.insert(agent.id.clone(), agent_path.clone());
        }

        // Recurse into nested agents
        if let Some(nested) = &agent.agents {
            collect_and_validate_ids(nested, &format!("{}.agents", agent_path), seen, errors);
        }
    }
}

/// Rules 7+15: Validate per-agent fields recursively.
fn validate_agent_fields(
    agents: &[crate::types::Agent],
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    for (i, agent) in agents.iter().enumerate() {
        let agent_path = format!("{}[{}]", path, i);

        // Rule 7: Non-empty role
        if agent.role.is_empty() {
            errors.push(ValidationError::EmptyRole {
                agent_id: agent.id.clone(),
                path: agent_path.clone(),
            });
        }

        // Rule 15: If agents is present, must be non-empty
        if let Some(nested) = &agent.agents {
            if nested.is_empty() {
                errors.push(ValidationError::EmptyNestedAgents {
                    agent_id: agent.id.clone(),
                    path: agent_path.clone(),
                });
            } else {
                validate_agent_fields(nested, &format!("{}.agents", agent_path), errors);
            }
        }
    }
}

/// Rules 16-18: Validate dependencies within each scope, then recurse.
fn validate_dependencies_in_scope(
    agents: &[crate::types::Agent],
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let ids_in_scope: HashSet<&str> = agents.iter().map(|a| a.id.as_str()).collect();

    for (i, agent) in agents.iter().enumerate() {
        let agent_path = format!("{}[{}]", path, i);

        for blocked_id in &agent.blocked_by {
            // Rule 17: No self-dependency
            if blocked_id == &agent.id {
                errors.push(ValidationError::SelfDependency {
                    agent_id: agent.id.clone(),
                    path: agent_path.clone(),
                });
            }
            // Rule 16: Reference must exist in same scope
            else if !ids_in_scope.contains(blocked_id.as_str()) {
                errors.push(ValidationError::BlockedByNotFound {
                    agent_id: agent.id.clone(),
                    referenced_id: blocked_id.clone(),
                    path: agent_path.clone(),
                });
            }
        }
    }

    // Rule 18: Acyclic
    detect_cycles(agents, path, errors);

    // Recurse into nested agent scopes
    for (i, agent) in agents.iter().enumerate() {
        if let Some(nested) = &agent.agents {
            if !nested.is_empty() {
                let nested_path = format!("{}[{}].agents", path, i);
                validate_dependencies_in_scope(nested, &nested_path, errors);
            }
        }
    }
}

/// Rule 18: DFS cycle detection within a single scope.
fn detect_cycles(
    agents: &[crate::types::Agent],
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let agent_map: HashMap<&str, &crate::types::Agent> =
        agents.iter().map(|a| (a.id.as_str(), a)).collect();

    #[derive(Clone, Copy, PartialEq)]
    enum Color {
        White,
        Gray,
        Black,
    }

    let mut color: HashMap<&str, Color> = agents.iter().map(|a| (a.id.as_str(), Color::White)).collect();

    fn dfs<'a>(
        node: &'a str,
        agent_map: &HashMap<&str, &'a crate::types::Agent>,
        color: &mut HashMap<&'a str, Color>,
        stack: &mut Vec<&'a str>,
        path: &str,
        errors: &mut Vec<ValidationError>,
    ) {
        color.insert(node, Color::Gray);
        stack.push(node);

        if let Some(agent) = agent_map.get(node) {
            for dep in &agent.blocked_by {
                let dep_str = dep.as_str();
                match color.get(dep_str) {
                    Some(Color::Gray) => {
                        // Found cycle — extract from stack
                        if let Some(cycle_start) = stack.iter().position(|&s| s == dep_str) {
                            let cycle: Vec<String> =
                                stack[cycle_start..].iter().map(|s| s.to_string()).collect();
                            errors.push(ValidationError::CyclicDependency {
                                cycle,
                                path: path.to_string(),
                            });
                        }
                    }
                    Some(Color::White) => {
                        if agent_map.contains_key(dep_str) {
                            dfs(dep_str, agent_map, color, stack, path, errors);
                        }
                    }
                    _ => {}
                }
            }
        }

        stack.pop();
        color.insert(node, Color::Black);
    }

    for agent in agents {
        if color.get(agent.id.as_str()) == Some(&Color::White) {
            let mut stack = Vec::new();
            dfs(agent.id.as_str(), &agent_map, &mut color, &mut stack, path, errors);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn minimal_agent(id: &str) -> Agent {
        Agent {
            id: id.into(),
            role: "does stuff".into(),
            model: Model::Sonnet,
            tools: vec![],
            blocked_by: vec![],
            background: false,
            output: Output::Inline,
            produces: None,
            execution_mode: None,
            agents: None,
        }
    }

    fn minimal_topology(agents: Vec<Agent>) -> Topology {
        Topology {
            task_summary: "Test task".into(),
            execution_mode: ExecutionMode::Subagents,
            agents,
        }
    }

    #[test]
    fn valid_id_cases() {
        assert!(is_valid_id("foo"));
        assert!(is_valid_id("a-b"));
        assert!(is_valid_id("a_b"));
        assert!(is_valid_id("A1"));
        assert!(is_valid_id("a"));
    }

    #[test]
    fn invalid_id_cases() {
        assert!(!is_valid_id(""));
        assert!(!is_valid_id("a b"));
        assert!(!is_valid_id("a.b"));
        assert!(!is_valid_id("a/b"));
        assert!(!is_valid_id("a@b"));
    }

    #[test]
    fn rule2_empty_task_summary() {
        let t = Topology {
            task_summary: "".into(),
            execution_mode: ExecutionMode::Subagents,
            agents: vec![minimal_agent("a")],
        };
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyTaskSummary)));
    }

    #[test]
    fn rule4_empty_agents() {
        let t = Topology {
            task_summary: "Test".into(),
            execution_mode: ExecutionMode::Subagents,
            agents: vec![],
        };
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyAgents)));
    }

    #[test]
    fn rule5_invalid_agent_id() {
        let t = minimal_topology(vec![minimal_agent("bad id")]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::InvalidAgentId { .. })));
    }

    #[test]
    fn rule6_duplicate_ids_same_level() {
        let t = minimal_topology(vec![minimal_agent("dup"), minimal_agent("dup")]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::DuplicateAgentId { .. })));
    }

    #[test]
    fn rule6_duplicate_ids_across_nesting() {
        let mut parent = minimal_agent("parent");
        parent.agents = Some(vec![minimal_agent("dup")]);
        let t = minimal_topology(vec![minimal_agent("dup"), parent]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::DuplicateAgentId { .. })));
    }

    #[test]
    fn rule7_empty_role() {
        let mut a = minimal_agent("a");
        a.role = "".into();
        let t = minimal_topology(vec![a]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyRole { .. })));
    }

    #[test]
    fn rule15_empty_nested_agents() {
        let mut a = minimal_agent("a");
        a.agents = Some(vec![]);
        let t = minimal_topology(vec![a]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyNestedAgents { .. })));
    }

    #[test]
    fn rule16_blocked_by_not_found() {
        let mut a = minimal_agent("a");
        a.blocked_by = vec!["nonexistent".into()];
        let t = minimal_topology(vec![a]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::BlockedByNotFound { .. })));
    }

    #[test]
    fn rule16_blocked_by_wrong_scope() {
        let mut parent = minimal_agent("parent");
        parent.agents = Some(vec![minimal_agent("child")]);
        let mut a = minimal_agent("a");
        a.blocked_by = vec!["child".into()];
        let t = minimal_topology(vec![a, parent]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::BlockedByNotFound { .. })));
    }

    #[test]
    fn rule17_self_dependency() {
        let mut a = minimal_agent("a");
        a.blocked_by = vec!["a".into()];
        let t = minimal_topology(vec![a]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::SelfDependency { .. })));
    }

    #[test]
    fn rule18_simple_cycle() {
        let mut a = minimal_agent("a");
        let mut b = minimal_agent("b");
        a.blocked_by = vec!["b".into()];
        b.blocked_by = vec!["a".into()];
        let t = minimal_topology(vec![a, b]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::CyclicDependency { .. })));
    }

    #[test]
    fn rule18_longer_cycle() {
        let mut a = minimal_agent("a");
        let mut b = minimal_agent("b");
        let mut c = minimal_agent("c");
        a.blocked_by = vec!["c".into()];
        b.blocked_by = vec!["a".into()];
        c.blocked_by = vec!["b".into()];
        let t = minimal_topology(vec![a, b, c]);
        let errs = validate(&t).unwrap_err();
        assert!(errs.iter().any(|e| matches!(e, ValidationError::CyclicDependency { .. })));
    }

    #[test]
    fn diamond_no_cycle() {
        let mut b = minimal_agent("b");
        let mut c = minimal_agent("c");
        let mut d = minimal_agent("d");
        b.blocked_by = vec!["a".into()];
        c.blocked_by = vec!["a".into()];
        d.blocked_by = vec!["b".into(), "c".into()];
        let t = minimal_topology(vec![minimal_agent("a"), b, c, d]);
        assert!(validate(&t).is_ok());
    }

    #[test]
    fn multi_error_collection() {
        let mut a = minimal_agent("bad id");
        a.role = "".into();
        let t = Topology {
            task_summary: "".into(),
            execution_mode: ExecutionMode::Subagents,
            agents: vec![a],
        };
        let errs = validate(&t).unwrap_err();
        assert!(errs.len() >= 3);
    }

    #[test]
    fn valid_topology_passes() {
        let mut b = minimal_agent("b");
        b.blocked_by = vec!["a".into()];
        let t = minimal_topology(vec![minimal_agent("a"), b]);
        assert!(validate(&t).is_ok());
    }

    #[test]
    fn valid_nested_topology() {
        let mut parent = minimal_agent("parent");
        let mut child_b = minimal_agent("child_b");
        child_b.blocked_by = vec!["child_a".into()];
        parent.execution_mode = Some(ExecutionMode::Subagents);
        parent.agents = Some(vec![minimal_agent("child_a"), child_b]);
        let t = minimal_topology(vec![parent]);
        assert!(validate(&t).is_ok());
    }
}
