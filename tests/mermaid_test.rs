use planview::mermaid::generate;
use planview::types::Topology;

fn load_and_generate(name: &str) -> Vec<String> {
    let json = std::fs::read_to_string(format!("tests/fixtures/{}", name)).unwrap();
    let topology: Topology = serde_json::from_str(&json).unwrap();
    generate(&topology)
}

#[test]
fn fixture_minimal() {
    let graphs = load_and_generate("valid_minimal.json");
    assert_eq!(graphs.len(), 1);
    assert!(graphs[0].contains("builder"));
    assert!(graphs[0].contains("main --> builder"));
}

#[test]
fn fixture_nested() {
    let graphs = load_and_generate("valid_nested.json");
    assert_eq!(graphs.len(), 2);

    // Step 1: researcher only
    assert!(graphs[0].contains("researcher"));
    assert!(!graphs[0].contains("implementer"));

    // Step 2: implementer with nested coder/tester
    assert!(graphs[1].contains("implementer"));
    assert!(graphs[1].contains("coder"));
    assert!(graphs[1].contains("tester"));

    // coder and tester have file output → stadium shape
    assert!(graphs[1].contains("([\"coder (sonnet)\"])"));
    assert!(graphs[1].contains("([\"tester (haiku)\"])"));

    // Edges: implementer dispatches coder, coder blocks tester
    assert!(graphs[1].contains("implementer --> coder"));
    assert!(graphs[1].contains("coder --> tester"));
}

#[test]
fn fixture_team() {
    let graphs = load_and_generate("valid_team.json");
    assert_eq!(graphs.len(), 1);

    let graph = &graphs[0];

    // Team subgraph wrapper
    assert!(graph.contains("subgraph team[\"team\"]"));

    // main --> unblocked agents only
    assert!(graph.contains("main --> frontend"));
    assert!(graph.contains("main --> backend"));
    assert!(!graph.contains("main --> integrator"));

    // blocked_by edges
    assert!(graph.contains("frontend --> integrator"));
    assert!(graph.contains("backend --> integrator"));
}
