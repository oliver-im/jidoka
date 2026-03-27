use std::io::{self, IsTerminal, Read};
use std::path::{Path, PathBuf};
use std::process;

use clap::{Parser, Subcommand};

use planview::types::Topology;

#[derive(Parser)]
#[command(name = "planview", about = "Visualize multi-agent task decomposition", disable_version_flag = true)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    /// Topology JSON file to render
    file: Option<String>,

    /// Output raw Mermaid graph definitions instead of HTML
    #[arg(long)]
    mermaid: bool,

    /// Plan markdown file for two-column layout
    #[arg(long)]
    plan: Option<String>,

    /// Dump topology JSON schema to stdout
    #[arg(long)]
    schema: bool,

    /// Validate JSON without rendering (exit 0 = valid, exit 1 = invalid)
    #[arg(long)]
    validate: bool,

    /// Render the built-in showcase
    #[arg(long)]
    example: bool,

    /// With --example, dump showcase JSON to stdout instead of rendering
    #[arg(long)]
    json: bool,

    /// Show version number
    #[arg(short = 'v', long = "version")]
    show_version: bool,
}

#[derive(Subcommand)]
enum Command {
    /// Process ExitPlanMode hook from stdin
    Hook,
    /// Generate index.html for a directory of JSON files
    Index {
        /// Directory containing topology JSON files
        dir: String,
    },
}

fn main() {
    let cli = Cli::parse();
    let result = run(cli);
    match result {
        Ok(()) => process::exit(0),
        Err(e) => {
            eprintln!("error: {e}");
            process::exit(1);
        }
    }
}

fn run(cli: Cli) -> Result<(), String> {
    match cli.command {
        Some(Command::Hook) => planview::hook::run(),
        Some(Command::Index { dir }) => run_index(&dir),
        None => run_render(cli),
    }
}

fn run_render(cli: Cli) -> Result<(), String> {
    if cli.show_version {
        println!("planview {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    if cli.schema {
        print_schema();
        return Ok(());
    }

    if cli.example {
        let topology = planview::example::showcase();
        if cli.json {
            println!(
                "{}",
                serde_json::to_string_pretty(&topology)
                    .map_err(|e| format!("JSON serialization error: {e}"))?
            );
            return Ok(());
        }
        return render_topology(&topology, None, cli.mermaid);
    }

    let input = read_input(&cli.file)?;
    let topology: Topology =
        serde_json::from_str(&input).map_err(|e| format!("parse error: {e}"))?;

    if cli.validate {
        return match planview::validate::validate(&topology) {
            Ok(()) => Ok(()),
            Err(errors) => {
                for err in &errors {
                    eprintln!("{err}");
                }
                Err(format!("{} validation error(s)", errors.len()))
            }
        };
    }

    let plan_markdown = match &cli.plan {
        Some(path) => Some(
            std::fs::read_to_string(path)
                .map_err(|e| format!("cannot read plan file '{path}': {e}"))?,
        ),
        None => None,
    };

    render_topology(&topology, plan_markdown.as_deref(), cli.mermaid)
}

fn render_topology(
    topology: &Topology,
    plan_markdown: Option<&str>,
    mermaid_only: bool,
) -> Result<(), String> {
    planview::validate::validate(topology).map_err(|errors| format_validation_errors(&errors))?;

    let graphs = planview::mermaid::generate(topology);

    if mermaid_only {
        for (i, graph) in graphs.iter().enumerate() {
            if i > 0 {
                println!();
            }
            print!("{graph}");
        }
        return Ok(());
    }

    let description = planview::describe::generate(topology);
    let html = planview::html::generate(topology, &graphs, &description, plan_markdown);

    let html_path = planview::output::write_temp_html(&html)?;
    println!("{}", html_path.display());

    if std::env::var("PLANVIEW_NO_OPEN").is_err() {
        planview::output::open_browser(&html_path)?;
    }

    Ok(())
}

fn run_index(dir: &str) -> Result<(), String> {
    let dir_path = Path::new(dir);
    let mut entries: Vec<_> = std::fs::read_dir(dir_path)
        .map_err(|e| format!("cannot read '{dir}': {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|ext| ext == "json"))
        .collect();
    entries.sort_by_key(|e| e.file_name());

    if entries.is_empty() {
        return Err(format!("no .json files found in '{dir}'"));
    }

    let mut gallery_items: Vec<(String, PathBuf)> = Vec::new();
    for entry in &entries {
        let json_path = entry.path();
        let json_str = match std::fs::read_to_string(&json_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("warning: skipping '{}': {e}", json_path.display());
                continue;
            }
        };
        let topology: Topology = match serde_json::from_str(&json_str) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("warning: skipping '{}': {e}", json_path.display());
                continue;
            }
        };
        if let Err(errors) = planview::validate::validate(&topology) {
            eprintln!("warning: skipping '{}': {}", json_path.display(), format_validation_errors(&errors));
            continue;
        }

        let graphs = planview::mermaid::generate(&topology);
        let description = planview::describe::generate(&topology);
        let html = planview::html::generate(&topology, &graphs, &description, None);
        let html_path = planview::output::write_temp_html(&html)?;
        gallery_items.push((topology.task_summary.clone(), html_path));
    }

    if gallery_items.is_empty() {
        return Err(format!("no valid topologies found in '{dir}'"));
    }

    let mut cards = String::new();
    for (summary, html_path) in &gallery_items {
        let escaped = planview::html::html_escape(summary);
        cards.push_str(&format!(
            r#"    <div class="card">
      <h2>{escaped}</h2>
      <iframe src="{}" loading="lazy"></iframe>
    </div>
"#,
            html_path.display()
        ));
    }

    let index_html = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>planview gallery</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{ font-family: system-ui, sans-serif; background: #f5f5f5; padding: 2rem; }}
    h1 {{ margin-bottom: 1.5rem; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(480px, 1fr)); gap: 1.5rem; }}
    .card {{ background: #fff; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
    .card h2 {{ font-size: 0.95rem; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }}
    .card iframe {{ width: 100%; height: 400px; border: none; }}
  </style>
</head>
<body>
  <h1>planview gallery ({} topologies)</h1>
  <div class="grid">
{cards}  </div>
</body>
</html>"#,
        gallery_items.len()
    );

    let index_path = dir_path.join("index.html");
    std::fs::write(&index_path, &index_html)
        .map_err(|e| format!("cannot write '{}': {e}", index_path.display()))?;
    println!("{}", index_path.display());

    if std::env::var("PLANVIEW_NO_OPEN").is_err() {
        planview::output::open_browser(&index_path)?;
    }

    Ok(())
}

fn read_input(file: &Option<String>) -> Result<String, String> {
    match file {
        Some(path) => {
            std::fs::read_to_string(path).map_err(|e| format!("cannot read '{path}': {e}"))
        }
        None => {
            if io::stdin().is_terminal() {
                return Err(
                    "no input: provide a file argument or pipe JSON to stdin".to_string()
                );
            }
            let mut buf = String::new();
            io::stdin()
                .read_to_string(&mut buf)
                .map_err(|e| format!("stdin read error: {e}"))?;
            Ok(buf)
        }
    }
}

fn format_validation_errors(errors: &[planview::validate::ValidationError]) -> String {
    let messages: Vec<String> = errors.iter().map(|e| format!("  {e}")).collect();
    format!("validation failed:\n{}", messages.join("\n"))
}

fn print_schema() {
    let schema = serde_json::json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Topology",
        "type": "object",
        "required": ["task_summary", "execution_mode", "agents"],
        "properties": {
            "task_summary": { "type": "string", "minLength": 1 },
            "execution_mode": { "type": "string", "enum": ["team", "subagents"] },
            "agents": {
                "type": "array",
                "minItems": 1,
                "items": { "$ref": "#/$defs/Agent" }
            }
        },
        "$defs": {
            "Agent": {
                "type": "object",
                "required": ["id", "role", "model", "tools", "blocked_by", "background"],
                "properties": {
                    "id": { "type": "string", "pattern": "^[a-zA-Z0-9_-]+$" },
                    "role": { "type": "string", "minLength": 1 },
                    "model": { "type": "string", "enum": ["haiku", "sonnet", "opus"] },
                    "tools": { "type": "array", "items": { "type": "string" } },
                    "blocked_by": { "type": "array", "items": { "type": "string" } },
                    "background": { "type": "boolean" },
                    "output": {
                        "oneOf": [
                            { "const": "inline" },
                            {
                                "type": "object",
                                "required": ["file"],
                                "properties": { "file": { "type": "string", "minLength": 1 } },
                                "additionalProperties": false
                            }
                        ],
                        "default": "inline"
                    },
                    "produces": { "type": "string" },
                    "execution_mode": { "type": "string", "enum": ["team", "subagents"] },
                    "agents": {
                        "type": "array",
                        "minItems": 1,
                        "items": { "$ref": "#/$defs/Agent" }
                    }
                }
            }
        }
    });
    println!("{}", serde_json::to_string_pretty(&schema).unwrap());
}
