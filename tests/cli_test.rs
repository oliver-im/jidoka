use std::process::Command;

fn planview_cmd() -> Command {
    let mut cmd = Command::new(env!("CARGO"));
    cmd.args(["run", "--quiet", "--"]);
    cmd.env("PLANVIEW_NO_OPEN", "1");
    cmd
}

#[test]
fn file_arg_renders_html() {
    let output = planview_cmd()
        .arg("tests/fixtures/valid_minimal.json")
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let path = stdout.trim();
    assert!(path.ends_with(".html"), "stdout should be an HTML path: {path}");
    assert!(
        std::path::Path::new(path).exists(),
        "HTML file should exist: {path}"
    );
}

#[test]
fn stdin_renders_html() {
    let json = std::fs::read_to_string("tests/fixtures/valid_minimal.json").unwrap();
    let mut child = planview_cmd()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(json.as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.trim().ends_with(".html"));
}

#[test]
fn mermaid_flag() {
    let output = planview_cmd()
        .args(["--mermaid", "tests/fixtures/valid_minimal.json"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("graph TD"));
}

#[test]
fn validate_flag_valid() {
    let output = planview_cmd()
        .args(["--validate", "tests/fixtures/valid_minimal.json"])
        .output()
        .unwrap();
    assert!(output.status.success());
}

#[test]
fn validate_flag_invalid() {
    let output = planview_cmd()
        .args(["--validate", "tests/fixtures/invalid_cycle.json"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("validation") || stderr.contains("Cyclic"),
        "stderr should mention validation error: {stderr}"
    );
}

#[test]
fn schema_flag() {
    let output = planview_cmd().arg("--schema").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("$schema"));
    assert!(stdout.contains("Topology"));
}

#[test]
fn version_flag() {
    let output = planview_cmd().arg("-v").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("planview"));
}

#[test]
fn example_json() {
    let output = planview_cmd()
        .args(["--example", "--json"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value = serde_json::from_str(&stdout).expect("should be valid JSON");
    assert!(parsed.get("task_summary").is_some());
    assert!(parsed.get("agents").is_some());
}

#[test]
fn example_renders() {
    let output = planview_cmd().arg("--example").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.trim().ends_with(".html"));
}

#[test]
fn example_json_piped_back_renders() {
    // --example --json | planview — the two CLI codepaths compose correctly
    let json_output = planview_cmd()
        .args(["--example", "--json"])
        .output()
        .unwrap();
    assert!(json_output.status.success());

    let mut child = planview_cmd()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(&json_output.stdout)
        .unwrap();
    let render_output = child.wait_with_output().unwrap();

    assert!(
        render_output.status.success(),
        "piped example JSON should render successfully: {}",
        String::from_utf8_lossy(&render_output.stderr)
    );
    let stdout = String::from_utf8_lossy(&render_output.stdout);
    let path = stdout.trim();
    assert!(path.ends_with(".html"), "should produce HTML: {path}");
    assert!(std::path::Path::new(path).exists(), "HTML file should exist: {path}");
}

#[test]
fn invalid_input_exits_1() {
    let mut child = planview_cmd()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"not json")
        .unwrap();
    let output = child.wait_with_output().unwrap();

    assert!(!output.status.success());
}

#[test]
fn empty_input_exits_1() {
    let mut child = planview_cmd()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .unwrap();

    use std::io::Write;
    child.stdin.take().unwrap().write_all(b"").unwrap();
    let output = child.wait_with_output().unwrap();

    assert!(!output.status.success());
}
