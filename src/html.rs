//! HTML assembly: combines Mermaid graphs, topology description, and optional
//! plan markdown into a self-contained HTML page using Askama templates.
//!
//! CSS and JS are embedded at build time via `include_str!()`. Plan markdown
//! is JSON-encoded and rendered client-side with marked + DOMPurify.

use askama::Template;

use crate::types::{Agent, ExecutionMode, Topology};

const CSS: &str = include_str!("../static/style.css");
const JS: &str = include_str!("../static/script.js");

#[derive(Template)]
#[template(path = "page.html", escape = "none")]
struct PageTemplate<'a> {
    task_summary: String,
    mode_label: String,
    mermaid_graphs: &'a [String],
    description: String,
    has_plan: bool,
    plan_markdown_json: String,
    phase_labels: Vec<String>,
    css: &'a str,
    js: &'a str,
}

/// Generates a self-contained HTML page from topology rendering outputs.
///
/// - `topology`: the parsed topology (used for task_summary, execution_mode)
/// - `mermaid_graphs`: output of `mermaid::generate()` — one graph per phase
/// - `description`: output of `describe::generate()` — human-readable overview
/// - `plan_markdown`: optional plan markdown content (from `--plan <file>`)
pub fn generate(
    topology: &Topology,
    mermaid_graphs: &[String],
    description: &str,
    plan_markdown: Option<&str>,
) -> String {
    let has_plan = plan_markdown.is_some();
    let plan_markdown_json = plan_markdown
        .map(|md| serde_json::to_string(md).expect("JSON string encoding"))
        .unwrap_or_default();

    let template = PageTemplate {
        task_summary: html_escape(&topology.task_summary),
        mode_label: build_mode_label(topology),
        mermaid_graphs,
        description: html_escape(description),
        has_plan,
        plan_markdown_json,
        phase_labels: build_phase_labels(topology, mermaid_graphs.len()),
        css: CSS,
        js: JS,
    };

    template.render().expect("template rendering failed")
}

pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn build_mode_label(topology: &Topology) -> String {
    let top = match topology.execution_mode {
        ExecutionMode::Team => "team",
        ExecutionMode::Subagents => "subagents",
    };

    let has_nested_team = has_nested_mode(&topology.agents, &ExecutionMode::Team);
    let has_nested_subagents = has_nested_mode(&topology.agents, &ExecutionMode::Subagents);

    match (&topology.execution_mode, has_nested_team, has_nested_subagents) {
        (ExecutionMode::Subagents, true, _) => "subagents + team".to_string(),
        (ExecutionMode::Team, _, true) => "team + subagents".to_string(),
        _ => top.to_string(),
    }
}

fn has_nested_mode(agents: &[Agent], target: &ExecutionMode) -> bool {
    agents.iter().any(|a| {
        if a.execution_mode.as_ref() == Some(target) {
            return true;
        }
        if let Some(children) = &a.agents {
            return has_nested_mode(children, target);
        }
        false
    })
}

fn build_phase_labels(topology: &Topology, graph_count: usize) -> Vec<String> {
    if topology.execution_mode == ExecutionMode::Subagents && graph_count > 1 {
        (1..=graph_count)
            .map(|i| format!("Phase {}", i))
            .collect()
    } else {
        vec![]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Model, Output};

    fn make_agent(id: &str, model: Model, blocked_by: Vec<&str>) -> Agent {
        Agent {
            id: id.into(),
            role: "does stuff".into(),
            model,
            tools: vec!["Read".into()],
            blocked_by: blocked_by.into_iter().map(String::from).collect(),
            background: false,
            output: Output::Inline,
            produces: None,
            execution_mode: None,
            agents: None,
        }
    }

    fn make_topology(mode: ExecutionMode, agents: Vec<Agent>) -> Topology {
        Topology {
            task_summary: "Build a widget".into(),
            execution_mode: mode,
            agents,
        }
    }

    fn minimal_html() -> String {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("builder", Model::Sonnet, vec![])],
        );
        let graphs = vec!["graph TD\n    main-->builder".into()];
        generate(&t, &graphs, "1. builder (sonnet)", None)
    }

    #[test]
    fn contains_title() {
        let html = minimal_html();
        assert!(html.contains("<title>Topology: Build a widget</title>"));
    }

    #[test]
    fn title_escapes_html() {
        let t = Topology {
            task_summary: "<script>alert(1)</script>".into(),
            execution_mode: ExecutionMode::Subagents,
            agents: vec![make_agent("a", Model::Haiku, vec![])],
        };
        let html = generate(&t, &["graph TD".into()], "desc", None);
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>alert"));
    }

    #[test]
    fn contains_mermaid_cdn() {
        let html = minimal_html();
        assert!(html.contains("mermaid@11.12.2"));
    }

    #[test]
    fn no_plan_single_column() {
        let html = minimal_html();
        assert!(html.contains("class=\"no-plan\""));
        assert!(!html.contains("<aside class=\"plan-panel\">"));
        assert!(!html.contains("marked@"));
        assert!(!html.contains("dompurify@"));
    }

    #[test]
    fn with_plan_two_column() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec![])],
        );
        let html = generate(
            &t,
            &["graph TD".into()],
            "desc",
            Some("# My Plan\n- step 1"),
        );
        assert!(html.contains("class=\"has-plan\""));
        assert!(html.contains("plan-panel"));
        assert!(html.contains("marked@15.0.7"));
        assert!(html.contains("dompurify@3.2.4"));
        assert!(html.contains("window.__planMarkdown"));
    }

    #[test]
    fn plan_markdown_json_encoded() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec![])],
        );
        let html = generate(
            &t,
            &["graph TD".into()],
            "desc",
            Some("test \"quotes\" and\nnewlines"),
        );
        // serde_json::to_string wraps in quotes and escapes
        assert!(html.contains(r#"\"quotes\""#));
        assert!(html.contains(r#"\n"#));
    }

    #[test]
    fn phase_labels_multi_step() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![
                make_agent("a", Model::Sonnet, vec![]),
                make_agent("b", Model::Sonnet, vec!["a"]),
            ],
        );
        let graphs = vec!["graph TD\n    a".into(), "graph TD\n    b".into()];
        let html = generate(&t, &graphs, "desc", None);
        assert!(html.contains("Phase 1"));
        assert!(html.contains("Phase 2"));
    }

    #[test]
    fn no_phase_labels_single_step() {
        let html = minimal_html();
        assert!(!html.contains("Phase 1"));
    }

    #[test]
    fn no_phase_labels_team() {
        let t = make_topology(
            ExecutionMode::Team,
            vec![
                make_agent("a", Model::Sonnet, vec![]),
                make_agent("b", Model::Sonnet, vec!["a"]),
            ],
        );
        let graphs = vec!["graph TD".into()];
        let html = generate(&t, &graphs, "desc", None);
        assert!(!html.contains("<h3 class=\"phase-label\">"));
    }

    #[test]
    fn mode_label_combined() {
        let mut parent = make_agent("parent", Model::Opus, vec![]);
        parent.execution_mode = Some(ExecutionMode::Team);
        parent.agents = Some(vec![make_agent("child", Model::Haiku, vec![])]);
        let t = make_topology(ExecutionMode::Subagents, vec![parent]);
        let html = generate(&t, &["graph TD".into()], "desc", None);
        assert!(html.contains("subagents + team"));
    }

    #[test]
    fn mode_label_simple() {
        let html = minimal_html();
        assert!(html.contains("Mode: subagents"));
        assert!(!html.contains("+ team"));
    }

    #[test]
    fn contains_legend() {
        let html = minimal_html();
        assert!(html.contains("Legend"));
        assert!(html.contains("swatch-haiku"));
        assert!(html.contains("swatch-sonnet"));
        assert!(html.contains("swatch-opus"));
        assert!(html.contains("swatch-main"));
        assert!(html.contains("shape-rect"));
        assert!(html.contains("shape-pill"));
    }

    #[test]
    fn embeds_css_js() {
        let html = minimal_html();
        assert!(html.contains("planview styles"));
        assert!(html.contains("planview client-side JS"));
    }

    #[test]
    fn mermaid_graphs_embedded() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec![])],
        );
        let graphs = vec!["graph TD\n    main-->builder".into()];
        let html = generate(&t, &graphs, "desc", None);
        assert!(html.contains("graph TD\n    main-->builder"));
    }

    #[test]
    fn description_embedded() {
        let t = make_topology(
            ExecutionMode::Subagents,
            vec![make_agent("a", Model::Sonnet, vec![])],
        );
        let html = generate(&t, &["graph TD".into()], "1. builder (sonnet)\n  tools: Read", None);
        assert!(html.contains("1. builder (sonnet)"));
    }

    #[test]
    fn fixture_minimal_full_pipeline() {
        let json = std::fs::read_to_string("tests/fixtures/valid_minimal.json").unwrap();
        let t: Topology = serde_json::from_str(&json).unwrap();
        let graphs = crate::mermaid::generate(&t);
        let desc = crate::describe::generate(&t);
        let html = generate(&t, &graphs, &desc, None);
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("</html>"));
        assert!(html.contains(&t.task_summary));
    }

    #[test]
    fn fixture_nested_with_plan() {
        let json = std::fs::read_to_string("tests/fixtures/valid_nested.json").unwrap();
        let t: Topology = serde_json::from_str(&json).unwrap();
        let graphs = crate::mermaid::generate(&t);
        let desc = crate::describe::generate(&t);
        let html = generate(&t, &graphs, &desc, Some("# Test Plan\n\nSome content"));
        assert!(html.contains("class=\"has-plan\""));
        assert!(html.contains("window.__planMarkdown"));
    }
}
