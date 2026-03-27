// ExitPlanMode hook processing

use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::types::Topology;

#[derive(Debug, Deserialize)]
struct HookInput {
    session_id: String,
}

struct Config {
    tmpdir: String,
    plans_dir: String,
    no_auto: bool,
    no_open: bool,
}

impl Config {
    fn from_env() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        Self {
            tmpdir: "/tmp".to_string(),
            plans_dir: std::env::var("CLAUDE_PLANS_DIR")
                .unwrap_or_else(|_| format!("{home}/.claude/plans")),
            no_auto: std::env::var("PLANVIEW_NO_AUTO").is_ok(),
            no_open: std::env::var("PLANVIEW_NO_OPEN").is_ok(),
        }
    }
}

/// Processes ExitPlanMode hook input from stdin.
/// Hook mode always exits 0 — this function never returns Err.
pub fn run() -> Result<(), String> {
    if let Err(e) = run_inner() {
        eprintln!("planview hook: {e}");
    }
    Ok(())
}

fn run_inner() -> Result<(), String> {
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .map_err(|e| format!("stdin read error: {e}"))?;
    run_with_input(&input, &Config::from_env())
}

fn run_with_input(input: &str, config: &Config) -> Result<(), String> {
    let hook_input: HookInput =
        serde_json::from_str(input).map_err(|e| format!("invalid hook input JSON: {e}"))?;

    let session_id = &hook_input.session_id;
    if !is_valid_session_id(session_id) {
        return Err(format!("invalid session_id: {session_id}"));
    }

    let tmpdir = Path::new(&config.tmpdir);
    let topology_path = tmpdir.join(format!("planview-{session_id}.json"));
    let marker_path = tmpdir.join(format!("planview-{session_id}.attempted"));

    match std::fs::read_to_string(&topology_path) {
        Ok(topology_json) => {
            render_topology(&topology_json, config)?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            handle_missing_topology(&marker_path, config.no_auto)?;
        }
        Err(e) => {
            return Err(format!("cannot read topology: {e}"));
        }
    }

    Ok(())
}

fn render_topology(topology_json: &str, config: &Config) -> Result<(), String> {
    let topology: Topology =
        serde_json::from_str(topology_json).map_err(|e| format!("invalid topology JSON: {e}"))?;

    crate::validate::validate(&topology)
        .map_err(|errors| format!("validation failed: {} error(s)", errors.len()))?;

    let graphs = crate::mermaid::generate(&topology);
    let description = crate::describe::generate(&topology);
    let plan_markdown = scan_plans_dir(&config.plans_dir);

    let html = crate::html::generate(&topology, &graphs, &description, plan_markdown.as_deref());
    let html_path = crate::output::write_temp_html_in(&html, &config.tmpdir)?;

    if !config.no_open {
        crate::output::open_browser(&html_path)?;
    }

    Ok(())
}

fn handle_missing_topology(marker_path: &Path, no_auto: bool) -> Result<(), String> {
    if no_auto {
        return Ok(());
    }

    let attempts = read_marker(marker_path);
    if attempts >= 3 {
        return Ok(());
    }

    write_marker(marker_path, attempts + 1)?;

    let deny = serde_json::json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "BLOCKED: You must run /planview with a summary of your plan before exiting plan mode. After /planview completes, you MUST call ExitPlanMode again to finish."
        }
    });

    println!(
        "{}",
        serde_json::to_string(&deny).map_err(|e| format!("JSON serialization error: {e}"))?
    );

    Ok(())
}

fn scan_plans_dir(plans_dir: &str) -> Option<String> {
    let dir = Path::new(plans_dir);
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;

    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let modified = match entry.metadata().and_then(|m| m.modified()) {
            Ok(t) => t,
            Err(_) => continue,
        };
        if best
            .as_ref()
            .map_or(true, |(best_time, _)| modified > *best_time)
        {
            best = Some((modified, path));
        }
    }

    best.and_then(|(_, path)| std::fs::read_to_string(&path).ok())
}

fn read_marker(path: &Path) -> u32 {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

fn write_marker(path: &Path, count: u32) -> Result<(), String> {
    std::fs::write(path, count.to_string())
        .map_err(|e| format!("cannot write marker '{}': {e}", path.display()))
}

fn is_valid_session_id(id: &str) -> bool {
    crate::validate::is_valid_id(id) && id.len() <= 128
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "planview-hook-{name}-{}",
            std::process::id()
        ));
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn test_config(tmpdir: &Path) -> Config {
        Config {
            tmpdir: tmpdir.to_str().unwrap().to_string(),
            plans_dir: "/tmp/planview-nonexistent-plans".to_string(),
            no_auto: false,
            no_open: true,
        }
    }

    // --- HookInput parsing ---

    #[test]
    fn hook_input_full() {
        let json = r#"{"session_id": "abc-123", "tool_name": "ExitPlanMode", "tool_input": {}}"#;
        let input: HookInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.session_id, "abc-123");
    }

    #[test]
    fn hook_input_minimal() {
        let json = r#"{"session_id": "test"}"#;
        let input: HookInput = serde_json::from_str(json).unwrap();
        assert_eq!(input.session_id, "test");
    }

    #[test]
    fn hook_input_missing_session_id() {
        let json = r#"{"tool_name": "ExitPlanMode"}"#;
        assert!(serde_json::from_str::<HookInput>(json).is_err());
    }

    // --- Session ID validation ---

    #[test]
    fn session_id_valid() {
        assert!(is_valid_session_id("abc-123"));
        assert!(is_valid_session_id("test_session"));
        assert!(is_valid_session_id("ABC"));
        assert!(is_valid_session_id("a"));
    }

    #[test]
    fn session_id_invalid() {
        assert!(!is_valid_session_id(""));
        assert!(!is_valid_session_id("../etc/passwd"));
        assert!(!is_valid_session_id("foo bar"));
        assert!(!is_valid_session_id(&"a".repeat(129)));
    }

    // --- Marker file ---

    #[test]
    fn marker_missing_returns_zero() {
        assert_eq!(read_marker(Path::new("/tmp/planview-nonexistent-marker")), 0);
    }

    #[test]
    fn marker_valid() {
        let dir = temp_dir("marker-valid");
        let path = dir.join("marker");
        fs::write(&path, "2").unwrap();
        assert_eq!(read_marker(&path), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_invalid_content() {
        let dir = temp_dir("marker-invalid");
        let path = dir.join("marker");
        fs::write(&path, "garbage").unwrap();
        assert_eq!(read_marker(&path), 0);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_roundtrip() {
        let dir = temp_dir("marker-roundtrip");
        let path = dir.join("marker");
        write_marker(&path, 3).unwrap();
        assert_eq!(read_marker(&path), 3);
        let _ = fs::remove_dir_all(&dir);
    }

    // --- scan_plans_dir ---

    #[test]
    fn plans_dir_empty() {
        let dir = temp_dir("plans-empty");
        assert!(scan_plans_dir(dir.to_str().unwrap()).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plans_dir_picks_newest() {
        let dir = temp_dir("plans-newest");

        fs::write(dir.join("old.md"), "old plan").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(50));
        fs::write(dir.join("new.md"), "new plan").unwrap();

        let result = scan_plans_dir(dir.to_str().unwrap());
        assert_eq!(result.as_deref(), Some("new plan"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plans_dir_ignores_non_md() {
        let dir = temp_dir("plans-non-md");
        fs::write(dir.join("notes.txt"), "not a plan").unwrap();

        assert!(scan_plans_dir(dir.to_str().unwrap()).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn plans_dir_missing() {
        assert!(scan_plans_dir("/tmp/planview-nonexistent-plans-dir").is_none());
    }

    // --- Deny JSON format ---

    #[test]
    fn deny_json_format() {
        let deny = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "BLOCKED: You must run /planview with a summary of your plan before exiting plan mode. After /planview completes, you MUST call ExitPlanMode again to finish."
            }
        });
        let output = serde_json::to_string(&deny).unwrap();
        assert!(output.contains("PreToolUse"));
        assert!(output.contains("deny"));
        assert!(output.contains("BLOCKED"));
    }

    // --- run_with_input integration ---

    #[test]
    fn missing_topology_emits_deny() {
        let dir = temp_dir("deny");
        let session = format!("deny-{}", std::process::id());
        let input = format!(r#"{{"session_id": "{session}"}}"#);
        let config = test_config(&dir);

        let result = run_with_input(&input, &config);
        assert!(result.is_ok());

        let marker = dir.join(format!("planview-{session}.attempted"));
        assert_eq!(fs::read_to_string(&marker).unwrap().trim(), "1");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_auto_skips_deny() {
        let dir = temp_dir("noauto");
        let session = format!("noauto-{}", std::process::id());
        let input = format!(r#"{{"session_id": "{session}"}}"#);
        let mut config = test_config(&dir);
        config.no_auto = true;

        let result = run_with_input(&input, &config);
        assert!(result.is_ok());

        let marker = dir.join(format!("planview-{session}.attempted"));
        assert!(!marker.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn gives_up_after_3_attempts() {
        let dir = temp_dir("giveup");
        let session = format!("giveup-{}", std::process::id());
        let marker = dir.join(format!("planview-{session}.attempted"));
        fs::write(&marker, "3").unwrap();

        let input = format!(r#"{{"session_id": "{session}"}}"#);
        let config = test_config(&dir);

        let result = run_with_input(&input, &config);
        assert!(result.is_ok());
        // Marker should still be "3" (not incremented)
        assert_eq!(fs::read_to_string(&marker).unwrap().trim(), "3");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn topology_exists_renders_html() {
        let dir = temp_dir("render");
        let session = format!("render-{}", std::process::id());

        let topology = r#"{
            "task_summary": "Hook test",
            "execution_mode": "subagents",
            "agents": [{
                "id": "agent1",
                "role": "Test agent",
                "model": "sonnet",
                "tools": ["Read"],
                "blocked_by": [],
                "background": false
            }]
        }"#;
        fs::write(
            dir.join(format!("planview-{session}.json")),
            topology,
        )
        .unwrap();

        let input = format!(r#"{{"session_id": "{session}"}}"#);
        let config = test_config(&dir);

        let result = run_with_input(&input, &config);
        assert!(result.is_ok());

        // Should have created an HTML file
        let html_files: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "html"))
            .collect();
        assert!(!html_files.is_empty(), "expected HTML file to be created");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn invalid_input_returns_err() {
        let config = test_config(Path::new("/tmp"));
        assert!(run_with_input("not json", &config).is_err());
    }

    #[test]
    fn invalid_session_id_returns_err() {
        let config = test_config(Path::new("/tmp"));
        let input = r#"{"session_id": "../etc/passwd"}"#;
        assert!(run_with_input(input, &config).is_err());
    }
}
