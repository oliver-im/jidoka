use std::path::{Path, PathBuf};

pub fn write_temp_html(html: &str) -> Result<PathBuf, String> {
    let tmpdir = std::env::var("TMPDIR").unwrap_or_else(|_| "/tmp".to_string());
    write_temp_html_in(html, &tmpdir)
}

pub fn write_temp_html_in(html: &str, tmpdir: &str) -> Result<PathBuf, String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("clock error: {e}"))?
        .as_millis();
    let filename = format!("planview-{timestamp}.html");
    let path = Path::new(tmpdir).join(filename);
    std::fs::write(&path, html).map_err(|e| format!("cannot write '{}': {e}", path.display()))?;
    Ok(path)
}

pub fn open_browser(path: &Path) -> Result<(), String> {
    if cfg!(target_os = "windows") {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path.display().to_string()])
            .spawn()
            .map_err(|e| format!("failed to open browser: {e}"))?;
    } else {
        let cmd = if cfg!(target_os = "macos") {
            "open"
        } else {
            "xdg-open"
        };
        std::process::Command::new(cmd)
            .arg(path)
            .spawn()
            .map_err(|e| format!("failed to open browser with '{cmd}': {e}"))?;
    }

    Ok(())
}
