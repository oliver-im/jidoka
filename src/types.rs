//! Topology data model: the JSON schema types shared by validation, graph
//! algorithms, and rendering. Defines [`Topology`] (the root), [`Agent`]
//! (recursive), and their field enums ([`ExecutionMode`], [`Model`], [`Output`]).
//!
//! All types derive `Serialize`/`Deserialize` for round-trip JSON fidelity.
//! Optional fields (`produces`, `execution_mode`, `agents`) reject explicit
//! `null` — omission is the only way to leave them unset.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionMode {
    Team,
    Subagents,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Model {
    Haiku,
    Sonnet,
    Opus,
}

impl Model {
    pub fn as_str(&self) -> &'static str {
        match self {
            Model::Haiku => "haiku",
            Model::Sonnet => "sonnet",
            Model::Opus => "opus",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Output {
    Inline,
    File { path: String },
}

impl Serialize for Output {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Output::Inline => serializer.serialize_str("inline"),
            Output::File { path } => {
                use serde::ser::SerializeMap;
                let mut map = serializer.serialize_map(Some(1))?;
                map.serialize_entry("file", path)?;
                map.end()
            }
        }
    }
}

impl<'de> Deserialize<'de> for Output {
    fn deserialize<D>(deserializer: D) -> Result<Output, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match &value {
            serde_json::Value::String(s) if s == "inline" => Ok(Output::Inline),
            serde_json::Value::String(s) => Err(serde::de::Error::custom(format!(
                "invalid output string: '{}', expected 'inline'",
                s
            ))),
            serde_json::Value::Object(map) => {
                if map.len() != 1 {
                    return Err(serde::de::Error::custom(
                        "output object must have exactly one key: 'file'",
                    ));
                }
                match map.get("file") {
                    Some(serde_json::Value::String(path)) if !path.is_empty() => {
                        Ok(Output::File {
                            path: path.clone(),
                        })
                    }
                    Some(serde_json::Value::String(_)) => Err(serde::de::Error::custom(
                        "output.file must be a non-empty string",
                    )),
                    _ => Err(serde::de::Error::custom(
                        "output object must have a 'file' string field",
                    )),
                }
            }
            _ => Err(serde::de::Error::custom(
                "output must be 'inline' or {\"file\": \"<path>\"}",
            )),
        }
    }
}

fn default_output() -> Output {
    Output::Inline
}

/// Deserializes an optional string that rejects explicit null.
/// Missing field → None (via #[serde(default)]), present string → Some(s), null → error.
fn deserialize_optional_string<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::String(s) => Ok(Some(s)),
        serde_json::Value::Null => Err(serde::de::Error::custom(
            "field cannot be null; omit it instead",
        )),
        _ => Err(serde::de::Error::custom("expected a string")),
    }
}

/// Deserializes an optional ExecutionMode that rejects explicit null.
fn deserialize_optional_execution_mode<'de, D>(
    deserializer: D,
) -> Result<Option<ExecutionMode>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Err(serde::de::Error::custom(
            "execution_mode cannot be null; omit it instead",
        )),
        other => ExecutionMode::deserialize(other)
            .map(Some)
            .map_err(serde::de::Error::custom),
    }
}

/// Deserializes an optional Vec<Agent> that rejects explicit null.
fn deserialize_optional_agents<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<Agent>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Err(serde::de::Error::custom(
            "agents cannot be null; omit it instead",
        )),
        other => Vec::<Agent>::deserialize(other)
            .map(Some)
            .map_err(serde::de::Error::custom),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Topology {
    pub task_summary: String,
    pub execution_mode: ExecutionMode,
    pub agents: Vec<Agent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub role: String,
    pub model: Model,
    pub tools: Vec<String>,
    pub blocked_by: Vec<String>,
    pub background: bool,
    #[serde(default = "default_output")]
    pub output: Output,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub produces: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_execution_mode",
        skip_serializing_if = "Option::is_none"
    )]
    pub execution_mode: Option<ExecutionMode>,
    #[serde(
        default,
        deserialize_with = "deserialize_optional_agents",
        skip_serializing_if = "Option::is_none"
    )]
    pub agents: Option<Vec<Agent>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_deser_inline() {
        let v: Output = serde_json::from_str(r#""inline""#).unwrap();
        assert_eq!(v, Output::Inline);
    }

    #[test]
    fn output_deser_file() {
        let v: Output = serde_json::from_str(r#"{"file": "out.md"}"#).unwrap();
        assert_eq!(v, Output::File { path: "out.md".into() });
    }

    #[test]
    fn output_deser_rejects_bad_string() {
        assert!(serde_json::from_str::<Output>(r#""other""#).is_err());
    }

    #[test]
    fn output_deser_rejects_empty_file() {
        assert!(serde_json::from_str::<Output>(r#"{"file": ""}"#).is_err());
    }

    #[test]
    fn output_deser_rejects_null() {
        assert!(serde_json::from_str::<Output>("null").is_err());
    }

    #[test]
    fn output_deser_rejects_number() {
        assert!(serde_json::from_str::<Output>("42").is_err());
    }

    #[test]
    fn output_deser_rejects_missing_file_key() {
        assert!(serde_json::from_str::<Output>(r#"{"path": "out.md"}"#).is_err());
    }

    #[test]
    fn output_deser_rejects_extra_keys() {
        assert!(serde_json::from_str::<Output>(r#"{"file": "out.md", "extra": true}"#).is_err());
    }

    #[test]
    fn output_ser_inline() {
        let s = serde_json::to_string(&Output::Inline).unwrap();
        assert_eq!(s, r#""inline""#);
    }

    #[test]
    fn output_ser_file() {
        let s = serde_json::to_string(&Output::File { path: "out.md".into() }).unwrap();
        assert_eq!(s, r#"{"file":"out.md"}"#);
    }

    #[test]
    fn model_deser_valid() {
        assert_eq!(serde_json::from_str::<Model>(r#""haiku""#).unwrap(), Model::Haiku);
        assert_eq!(serde_json::from_str::<Model>(r#""sonnet""#).unwrap(), Model::Sonnet);
        assert_eq!(serde_json::from_str::<Model>(r#""opus""#).unwrap(), Model::Opus);
    }

    #[test]
    fn model_deser_rejects_invalid() {
        assert!(serde_json::from_str::<Model>(r#""gpt4""#).is_err());
    }

    #[test]
    fn execution_mode_deser_valid() {
        assert_eq!(
            serde_json::from_str::<ExecutionMode>(r#""team""#).unwrap(),
            ExecutionMode::Team
        );
        assert_eq!(
            serde_json::from_str::<ExecutionMode>(r#""subagents""#).unwrap(),
            ExecutionMode::Subagents
        );
    }

    #[test]
    fn execution_mode_deser_rejects_invalid() {
        assert!(serde_json::from_str::<ExecutionMode>(r#""parallel""#).is_err());
    }

    #[test]
    fn agent_all_fields() {
        let json = r#"{
            "id": "writer",
            "role": "Write docs",
            "model": "sonnet",
            "tools": ["Read", "Write"],
            "blocked_by": ["researcher"],
            "background": false,
            "output": {"file": "docs/output.md"},
            "produces": "documentation",
            "execution_mode": "subagents",
            "agents": [{
                "id": "sub1",
                "role": "Sub task",
                "model": "haiku",
                "tools": [],
                "blocked_by": [],
                "background": false
            }]
        }"#;
        let agent: Agent = serde_json::from_str(json).unwrap();
        assert_eq!(agent.id, "writer");
        assert_eq!(agent.output, Output::File { path: "docs/output.md".into() });
        assert_eq!(agent.produces, Some("documentation".into()));
        assert_eq!(agent.execution_mode, Some(ExecutionMode::Subagents));
        assert_eq!(agent.agents.as_ref().unwrap().len(), 1);
    }

    #[test]
    fn agent_optional_fields_omitted() {
        let json = r#"{
            "id": "reader",
            "role": "Read files",
            "model": "haiku",
            "tools": ["Read"],
            "blocked_by": [],
            "background": false
        }"#;
        let agent: Agent = serde_json::from_str(json).unwrap();
        assert_eq!(agent.output, Output::Inline);
        assert_eq!(agent.produces, None);
        assert_eq!(agent.execution_mode, None);
        assert_eq!(agent.agents, None);
    }

    #[test]
    fn agent_rejects_null_produces() {
        let json = r#"{
            "id": "a",
            "role": "test",
            "model": "haiku",
            "tools": [],
            "blocked_by": [],
            "background": false,
            "produces": null
        }"#;
        assert!(serde_json::from_str::<Agent>(json).is_err());
    }

    #[test]
    fn agent_rejects_null_execution_mode() {
        let json = r#"{
            "id": "a",
            "role": "test",
            "model": "haiku",
            "tools": [],
            "blocked_by": [],
            "background": false,
            "execution_mode": null
        }"#;
        assert!(serde_json::from_str::<Agent>(json).is_err());
    }

    #[test]
    fn agent_rejects_null_agents() {
        let json = r#"{
            "id": "a",
            "role": "test",
            "model": "haiku",
            "tools": [],
            "blocked_by": [],
            "background": false,
            "agents": null
        }"#;
        assert!(serde_json::from_str::<Agent>(json).is_err());
    }

    #[test]
    fn topology_round_trip() {
        let json = r#"{
            "task_summary": "Build a widget",
            "execution_mode": "subagents",
            "agents": [{
                "id": "a1",
                "role": "Do thing",
                "model": "opus",
                "tools": [],
                "blocked_by": [],
                "background": false
            }]
        }"#;
        let topology: Topology = serde_json::from_str(json).unwrap();
        let serialized = serde_json::to_string(&topology).unwrap();
        let roundtrip: Topology = serde_json::from_str(&serialized).unwrap();
        assert_eq!(topology.task_summary, roundtrip.task_summary);
        assert_eq!(topology.agents.len(), roundtrip.agents.len());
    }
}
