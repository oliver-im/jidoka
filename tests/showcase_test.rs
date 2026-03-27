use planview::types::Topology;

#[test]
fn showcase_full_pipeline() {
    let t = planview::example::showcase();
    planview::validate::validate(&t).unwrap();
    let g = planview::mermaid::generate(&t);
    let d = planview::describe::generate(&t);
    let h = planview::html::generate(&t, &g, &d, None);
    assert!(h.contains("Build and deploy"));
    assert!(h.contains("graph TD"));
}

#[test]
fn showcase_json_roundtrip_full_pipeline() {
    let t = planview::example::showcase();
    let json = serde_json::to_string(&t).unwrap();
    let t2: Topology = serde_json::from_str(&json).unwrap();
    planview::validate::validate(&t2).unwrap();
    let g1 = planview::mermaid::generate(&t);
    let g2 = planview::mermaid::generate(&t2);
    assert_eq!(g1, g2);
}
