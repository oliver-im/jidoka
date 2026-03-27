//! Topological sort and step assignment for agent dependency graphs.
//!
//! Computes step numbers from `blocked_by` edges via memoized DFS, then groups
//! agents by step for downstream consumers (`mermaid.rs`, `describe.rs`).
//!
//! Operates on a single scope (`&[Agent]`) — callers recurse into nested agent
//! arrays themselves. Assumes input has already passed [`crate::validate`]
//! (no cycles, no missing references, no self-dependencies).

use std::collections::{BTreeMap, HashMap};

use crate::types::Agent;

/// Agents grouped by step number, in execution order.
///
/// Step 1 = no blockers, step N+1 = blocked by a step-N agent.
/// Agents within a step are parallel and preserve their original array order.
#[derive(Debug)]
pub struct StepPlan<'a> {
    pub steps: BTreeMap<usize, Vec<&'a Agent>>,
}

impl<'a> StepPlan<'a> {
    /// Total number of steps (phases).
    pub fn step_count(&self) -> usize {
        self.steps.len()
    }

    /// Whether this plan has multiple steps (i.e., is phased).
    pub fn is_multi_step(&self) -> bool {
        self.steps.len() > 1
    }

    /// All agents across all steps, in step order then original array order.
    pub fn all_agents(&self) -> Vec<&'a Agent> {
        self.steps.values().flat_map(|v| v.iter().copied()).collect()
    }
}

/// Assigns a step number to each agent in the given scope.
///
/// - Agents with no blockers get step 1.
/// - Agents blocked by step-N agents get step N+1.
/// - Uses memoized DFS; assumes valid input (no cycles, no missing references).
///
/// Returns a map from agent ID to step number.
pub fn assign_steps(agents: &[Agent]) -> HashMap<&str, usize> {
    let agents_by_id: HashMap<&str, &Agent> = agents
        .iter()
        .map(|a| (a.id.as_str(), a))
        .collect();

    let mut depths: HashMap<&str, usize> = HashMap::new();

    for agent in agents {
        get_depth(agent.id.as_str(), &agents_by_id, &mut depths);
    }

    depths
}

fn get_depth<'a>(
    id: &'a str,
    agents_by_id: &HashMap<&'a str, &'a Agent>,
    depths: &mut HashMap<&'a str, usize>,
) -> usize {
    if let Some(&d) = depths.get(id) {
        return d;
    }

    let agent = agents_by_id[id];
    let depth = if agent.blocked_by.is_empty() {
        1
    } else {
        let max_blocker = agent
            .blocked_by
            .iter()
            .map(|b| get_depth(b.as_str(), agents_by_id, depths))
            .max()
            .unwrap();
        max_blocker + 1
    };

    depths.insert(id, depth);
    depth
}

/// Groups agents by step number, preserving original array order within each step.
///
/// This is the primary entry point for downstream consumers (mermaid.rs, describe.rs).
pub fn group_by_step(agents: &[Agent]) -> StepPlan<'_> {
    let step_map = assign_steps(agents);

    let mut steps: BTreeMap<usize, Vec<&Agent>> = BTreeMap::new();
    for agent in agents {
        let &step = step_map.get(agent.id.as_str()).unwrap();
        steps.entry(step).or_default().push(agent);
    }

    StepPlan { steps }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Model, Output};

    fn agent(id: &str, blocked_by: Vec<&str>) -> Agent {
        Agent {
            id: id.into(),
            role: "does stuff".into(),
            model: Model::Sonnet,
            tools: vec![],
            blocked_by: blocked_by.into_iter().map(String::from).collect(),
            background: false,
            output: Output::Inline,
            produces: None,
            execution_mode: None,
            agents: None,
        }
    }

    #[test]
    fn single_agent_step_1() {
        let agents = vec![agent("a", vec![])];
        let plan = group_by_step(&agents);
        assert_eq!(plan.step_count(), 1);
        assert_eq!(plan.steps[&1].len(), 1);
        assert_eq!(plan.steps[&1][0].id, "a");
    }

    #[test]
    fn parallel_agents_same_step() {
        let agents = vec![agent("a", vec![]), agent("b", vec![])];
        let plan = group_by_step(&agents);
        assert_eq!(plan.step_count(), 1);
        assert_eq!(plan.steps[&1].len(), 2);
        assert_eq!(plan.steps[&1][0].id, "a");
        assert_eq!(plan.steps[&1][1].id, "b");
    }

    #[test]
    fn linear_chain() {
        let agents = vec![
            agent("a", vec![]),
            agent("b", vec!["a"]),
            agent("c", vec!["b"]),
        ];
        let plan = group_by_step(&agents);
        assert_eq!(plan.step_count(), 3);
        assert_eq!(plan.steps[&1][0].id, "a");
        assert_eq!(plan.steps[&2][0].id, "b");
        assert_eq!(plan.steps[&3][0].id, "c");
    }

    #[test]
    fn diamond_dependency() {
        let agents = vec![
            agent("a", vec![]),
            agent("b", vec!["a"]),
            agent("c", vec!["a"]),
            agent("d", vec!["b", "c"]),
        ];
        let plan = group_by_step(&agents);
        assert_eq!(plan.step_count(), 3);
        assert_eq!(plan.steps[&1].len(), 1);
        assert_eq!(plan.steps[&1][0].id, "a");
        assert_eq!(plan.steps[&2].len(), 2);
        assert_eq!(plan.steps[&2][0].id, "b");
        assert_eq!(plan.steps[&2][1].id, "c");
        assert_eq!(plan.steps[&3].len(), 1);
        assert_eq!(plan.steps[&3][0].id, "d");
    }

    #[test]
    fn team_scenario() {
        let agents = vec![
            agent("frontend", vec![]),
            agent("backend", vec![]),
            agent("integrator", vec!["frontend", "backend"]),
        ];
        let plan = group_by_step(&agents);
        assert_eq!(plan.step_count(), 2);
        assert_eq!(plan.steps[&1].len(), 2);
        assert_eq!(plan.steps[&2].len(), 1);
        assert_eq!(plan.steps[&2][0].id, "integrator");
    }

    #[test]
    fn preserves_original_order() {
        let agents = vec![agent("z", vec![]), agent("a", vec![])];
        let plan = group_by_step(&agents);
        assert_eq!(plan.steps[&1][0].id, "z");
        assert_eq!(plan.steps[&1][1].id, "a");
    }

    #[test]
    fn assign_steps_raw_map() {
        let agents = vec![
            agent("a", vec![]),
            agent("b", vec!["a"]),
        ];
        let steps = assign_steps(&agents);
        assert_eq!(steps["a"], 1);
        assert_eq!(steps["b"], 2);
    }

    #[test]
    fn is_multi_step_single() {
        let agents = vec![agent("a", vec![])];
        assert!(!group_by_step(&agents).is_multi_step());
    }

    #[test]
    fn is_multi_step_multiple() {
        let agents = vec![agent("a", vec![]), agent("b", vec!["a"])];
        assert!(group_by_step(&agents).is_multi_step());
    }

    #[test]
    fn asymmetric_merge() {
        let agents = vec![
            agent("a", vec![]),
            agent("b", vec!["a"]),
            agent("c", vec![]),
            agent("d", vec!["b", "c"]),
        ];
        let steps = assign_steps(&agents);
        assert_eq!(steps["a"], 1);
        assert_eq!(steps["b"], 2);
        assert_eq!(steps["c"], 1);
        assert_eq!(steps["d"], 3);
    }
}
