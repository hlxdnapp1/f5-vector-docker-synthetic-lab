// R7B-G1B8 offline research only; this does NOT connect to Docker.
// Intended Rust integration probe (not executed until a pinned, approved Cargo environment exists).
#![forbid(unsafe_code)]

use bollard_stubs::models::{ContainerInspectResponse, ContainerSummary};
use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{json, Value};

const CREATED: &str = "2026-11-17T12:00:00.123456789Z";
const CREATED_MINUS_ONE_NS: &str = "2026-11-17T12:00:00.123456788Z";
const SECONDS: i64 = 1_794_916_800;

// Fixed public synthetic identities. Nothing here can reference the real Windows containers.
fn synthetic_id() -> String { "a".repeat(64) }
fn synthetic_image() -> String { format!("r7b-public-synthetic@sha256:{}", "b".repeat(64)) }
fn synthetic_image_id() -> String { format!("sha256:{}", "c".repeat(64)) }
fn labels() -> Value { json!({"r7b.lab.owner":"LAB_ONLY", "r7b.lab.role":"fixture"}) }

fn make_list() -> Value {
    json!([{
        "Id": synthetic_id(), "Names": ["/r7b-synthetic-fixture"],
        "Image": synthetic_image(), "ImageID": synthetic_image_id(),
        "Labels": labels(), "State": "running", "Status": "Up 1 second",
        "Created": SECONDS,
        "HostConfig": {"NetworkMode":"none"}, "NetworkSettings": {"Networks":{}},
        "Ports": [], "Mounts": []
    }])
}

fn make_inspect(created: &str) -> Value {
    json!({
        "Id": synthetic_id(), "Name": "/r7b-synthetic-fixture",
        "Image": synthetic_image_id(), "Created": created,
        "Config": {"Image": synthetic_image(), "Labels": labels(), "Tty":false,
                   "Env":[], "ExposedPorts":{}},
        "State": {"Status":"running", "Running":true},
        "HostConfig": {"NetworkMode":"none", "Privileged":false, "ReadonlyRootfs":true},
        "Mounts":[], "NetworkSettings":{"Networks":{}, "Ports":{}}
    })
}

fn parsed_list() -> Vec<ContainerSummary> {
    serde_json::from_value(make_list()).expect("synthetic LIST must deserialize")
}
fn parsed_inspect(stamp: &str) -> ContainerInspectResponse {
    serde_json::from_value(make_inspect(stamp)).expect("synthetic INSPECT must deserialize")
}

#[test]
fn list_deserializes_with_concrete_stubs_model() {
    let rows = parsed_list();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id.as_deref(), Some(synthetic_id().as_str()));
    assert_eq!(rows[0].names.as_ref().expect("Vector requires Names")[0], "/r7b-synthetic-fixture");
    assert_eq!(rows[0].created, Some(SECONDS));
}

#[test]
fn inspect_deserializes_with_chrono_not_string() {
    let detail = parsed_inspect(CREATED);
    let created: DateTime<Utc> = detail.created.expect("Vector requires Created");
    assert_eq!(created.timestamp(), SECONDS);
    assert_eq!(created.timestamp_subsec_nanos(), 123_456_789);
    assert_eq!(created.to_rfc3339_opts(SecondsFormat::Nanos, true), CREATED);
}

#[test]
fn distinct_nanoseconds_remain_distinct_after_serde() {
    let a: DateTime<Utc> = parsed_inspect(CREATED).created.unwrap();
    let b: DateTime<Utc> = parsed_inspect(CREATED_MINUS_ONE_NS).created.unwrap();
    assert_eq!(a.timestamp(), b.timestamp());
    assert_eq!(a.timestamp_subsec_nanos() - b.timestamp_subsec_nanos(), 1);
}

#[test]
fn vector_uses_config_image_and_name() {
    let detail = parsed_inspect(CREATED);
    assert_eq!(detail.name.as_deref(), Some("/r7b-synthetic-fixture"));
    assert_eq!(detail.config.as_ref().and_then(|c| c.image.as_deref()), Some(synthetic_image().as_str()));
    assert_eq!(detail.image.as_deref(), Some(synthetic_image_id().as_str()));
}

#[test]
fn missing_created_is_an_option_not_an_automatic_serde_failure() {
    let mut raw = make_inspect(CREATED);
    raw.as_object_mut().unwrap().remove("Created");
    let detail: ContainerInspectResponse = serde_json::from_value(raw).expect("optional Created");
    assert!(detail.created.is_none(), "Vector unwrap would not be safe");
}

#[test]
fn missing_config_is_an_option_not_an_automatic_serde_failure() {
    let mut raw = make_inspect(CREATED);
    raw.as_object_mut().unwrap().remove("Config");
    let detail: ContainerInspectResponse = serde_json::from_value(raw).expect("optional Config");
    assert!(detail.config.is_none(), "Vector unwrap would not be safe");
}

#[test]
fn missing_config_image_is_an_option_not_an_automatic_serde_failure() {
    let mut raw = make_inspect(CREATED);
    raw["Config"].as_object_mut().unwrap().remove("Image");
    let detail: ContainerInspectResponse = serde_json::from_value(raw).expect("optional Image");
    assert!(detail.config.unwrap().image.is_none(), "Vector unwrap would not be safe");
}

#[test]
fn missing_list_id_and_names_are_optional_at_serde_level() {
    let raw = json!([{"State":"running", "Created":SECONDS}]);
    let rows: Vec<ContainerSummary> = serde_json::from_value(raw).expect("optional ID/Names");
    assert!(rows[0].id.is_none());
    assert!(rows[0].names.is_none());
}

#[test]
fn malformed_timestamp_must_fail_chrono_deserialization() {
    let invalid = make_inspect("2026-02-30T12:00:00.123456789Z");
    assert!(serde_json::from_value::<ContainerInspectResponse>(invalid).is_err());
}

#[test]
fn numeric_created_must_fail_chrono_deserialization() {
    let mut raw = make_inspect(CREATED);
    raw["Created"] = json!(SECONDS);
    assert!(serde_json::from_value::<ContainerInspectResponse>(raw).is_err());
}

#[test]
fn unexpected_metadata_is_ignored_by_serde_and_must_be_removed_upstream() {
    let mut raw = make_inspect(CREATED);
    raw["CANARY_PRIVATE"] = json!("MUST_NEVER_BE_FORWARDED");
    let detail: ContainerInspectResponse = serde_json::from_value(raw).expect("unknown fields ignored");
    assert_eq!(detail.name.as_deref(), Some("/r7b-synthetic-fixture"));
    // Demonstrates why the R7B allowlist sanitizer, not Serde, enforces isolation.
}

#[test]
fn foreign_id_is_deserialized_by_serde_and_requires_allowlist() {
    let mut raw = make_inspect(CREATED);
    raw["Id"] = json!("d".repeat(64));
    let detail: ContainerInspectResponse = serde_json::from_value(raw).expect("syntactically valid");
    assert_ne!(detail.id.as_deref(), Some(synthetic_id().as_str()));
    // Do not use the deserializer as an authorization layer.
}
