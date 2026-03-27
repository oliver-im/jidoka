use planview::types::Topology;
use planview::validate::{validate, ValidationError};

fn load_fixture(name: &str) -> String {
    std::fs::read_to_string(format!("tests/fixtures/{}", name)).unwrap()
}

fn parse_and_validate(name: &str) -> Result<(), Vec<ValidationError>> {
    let json = load_fixture(name);
    let topology: Topology = serde_json::from_str(&json).unwrap();
    validate(&topology)
}

#[test]
fn valid_minimal() {
    assert!(parse_and_validate("valid_minimal.json").is_ok());
}

#[test]
fn valid_nested() {
    assert!(parse_and_validate("valid_nested.json").is_ok());
}

#[test]
fn valid_team() {
    assert!(parse_and_validate("valid_team.json").is_ok());
}

#[test]
fn invalid_empty_agents() {
    let errs = parse_and_validate("invalid_empty_agents.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyAgents)));
}

#[test]
fn invalid_cycle() {
    let errs = parse_and_validate("invalid_cycle.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::CyclicDependency { .. })));
}

#[test]
fn invalid_duplicate_id() {
    let errs = parse_and_validate("invalid_duplicate_id.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::DuplicateAgentId { .. })));
}

#[test]
fn invalid_bad_id() {
    let errs = parse_and_validate("invalid_bad_id.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::InvalidAgentId { .. })));
}

#[test]
fn invalid_model_rejected_at_parse() {
    let json = r#"{
        "task_summary": "Test",
        "execution_mode": "subagents",
        "agents": [{
            "id": "a",
            "role": "test",
            "model": "gpt4",
            "tools": [],
            "blocked_by": [],
            "background": false
        }]
    }"#;
    assert!(serde_json::from_str::<Topology>(json).is_err());
}

#[test]
fn invalid_execution_mode_rejected_at_parse() {
    let json = r#"{
        "task_summary": "Test",
        "execution_mode": "parallel",
        "agents": []
    }"#;
    assert!(serde_json::from_str::<Topology>(json).is_err());
}

#[test]
fn output_defaults_to_inline_when_omitted() {
    let json = load_fixture("valid_minimal.json");
    let topology: Topology = serde_json::from_str(&json).unwrap();
    assert_eq!(topology.agents[0].output, planview::types::Output::Inline);
}

#[test]
fn invalid_empty_task_summary() {
    let errs = parse_and_validate("invalid_empty_task_summary.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyTaskSummary)));
}

#[test]
fn invalid_empty_role() {
    let errs = parse_and_validate("invalid_empty_role.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyRole { .. })));
}

#[test]
fn invalid_self_dep() {
    let errs = parse_and_validate("invalid_self_dep.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::SelfDependency { .. })));
}

#[test]
fn invalid_blocked_by_not_found() {
    let errs = parse_and_validate("invalid_blocked_by_not_found.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::BlockedByNotFound { .. })));
}

#[test]
fn invalid_empty_nested_agents() {
    let errs = parse_and_validate("invalid_empty_nested_agents.json").unwrap_err();
    assert!(errs.iter().any(|e| matches!(e, ValidationError::EmptyNestedAgents { .. })));
}
