use planview::types::Topology;

fn load_topology(name: &str) -> Topology {
    let json = std::fs::read_to_string(format!("tests/fixtures/{name}")).unwrap();
    serde_json::from_str(&json).unwrap()
}

#[test]
fn mermaid_deterministic() {
    let t = load_topology("valid_nested.json");
    let g1 = planview::mermaid::generate(&t);
    let g2 = planview::mermaid::generate(&t);
    assert_eq!(g1, g2);
}

#[test]
fn html_deterministic() {
    let t = load_topology("valid_nested.json");
    let g = planview::mermaid::generate(&t);
    let d = planview::describe::generate(&t);
    let h1 = planview::html::generate(&t, &g, &d, None);
    let h2 = planview::html::generate(&t, &g, &d, None);
    assert_eq!(h1, h2);
}

#[test]
fn description_deterministic() {
    let t = load_topology("valid_nested.json");
    let d1 = planview::describe::generate(&t);
    let d2 = planview::describe::generate(&t);
    assert_eq!(d1, d2);
}
