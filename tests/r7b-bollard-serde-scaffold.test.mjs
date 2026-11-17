import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

// STATIC preflight ONLY; Rust/Cargo and real Bollard deserialization are not executed here.
const root = new URL('../rust/r7b-bollard-serde-probe/', import.meta.url);
const manifest = readFileSync(new URL('Cargo.toml', root), 'utf8');
const source = readFileSync(new URL('tests/serde_models.rs', root), 'utf8');
const has = (pattern, text) => assert.match(text, pattern);

test('R7B8-01 separate non-publishable Cargo research crate', () => {
  has(/^name = "r7b-bollard-serde-probe"$/m, manifest);
  has(/^publish = false$/m, manifest);
});
test('R7B8-02 pinned exact Bollard stubs from Vector lock', () => {
  has(/bollard-stubs\s*=\s*\{\s*version\s*=\s*"=1\.49\.0-rc\.28\.3\.3"/, manifest);
});
test('R7B8-03 feature chrono explicitly enabled on stubs', () => {
  has(/bollard-stubs\s*=\s*\{[^\n]*features\s*=\s*\["chrono"\]/, manifest);
});
test('R7B8-04 chrono pinned exactly to Vector Cargo.lock', () => {
  has(/^chrono\s*=\s*\{[^\n]*"=0\.4\.41"/m, manifest);
});
test('R7B8-05 serde_json pinned exactly to Vector Cargo.lock', () => {
  has(/^serde_json\s*=\s*\{[^\n]*"=1\.0\.145"/m, manifest);
});
test('R7B8-06 no Docker client is a Cargo dependency', () => {
  assert.doesNotMatch(manifest,/^bollard\s*=/m);
  assert.doesNotMatch(manifest,/^tokio\s*=/m);
});
test('R7B8-07 real generated Bollard model types referenced', () => {
  has(/use bollard_stubs::models::\{ContainerInspectResponse, ContainerSummary\}/, source);
});
test('R7B8-08 compile-time intended Chrono DateTime UTC typing', () => {
  has(/let created: DateTime<Utc> = detail\.created/, source);
});
test('R7B8-09 nine-digit nanoseconds and one-nanosecond delta are tested', () => {
  has(/timestamp_subsec_nanos\(\), 123_456_789/, source);
  has(/fn distinct_nanoseconds_remain_distinct_after_serde\(/, source);
});
test('R7B8-10 optional Created and Config absence explicitly tested', () => {
  has(/fn missing_created_is_an_option/, source);
  has(/fn missing_config_is_an_option/, source);
  has(/fn missing_config_image_is_an_option/, source);
});
test('R7B8-11 missing LIST Id and Names explicitly tested', () => {
  has(/fn missing_list_id_and_names_are_optional_at_serde_level/, source);
});
test('R7B8-12 type and calendar failures explicitly tested', () => {
  has(/fn malformed_timestamp_must_fail_chrono_deserialization/, source);
  has(/fn numeric_created_must_fail_chrono_deserialization/, source);
});
test('R7B8-13 unknown metadata and foreign ID are NOT assumed rejected by Serde', () => {
  has(/fn unexpected_metadata_is_ignored_by_serde/, source);
  has(/fn foreign_id_is_deserialized_by_serde/, source);
});
test('R7B8-14 code has no Docker network interfaces or mutating APIs', () => {
  assert.doesNotMatch(source, /\bDocker::|connect_with|container_create|start_container|stop_container|remove_container|std::net|reqwest|hyper::Client|tokio::net/);
  assert.doesNotMatch(source,/host\.docker\.internal|\.docker\.sock|f5solucoes\.net|supabase_vector_/);
});
test('R7B8-15 probe includes only public synthetic IDs and labels', () => {
  has(/"a"\.repeat\(64\)/, source);
  has(/"r7b\.lab\.owner":"LAB_ONLY"/, source);
  assert.doesNotMatch(source, /CANARY_PRIVATE.*DOCKER_HOST/);
});
test('R7B8-16 transitive lock remains a separate required gate', () => {
  assert.equal(existsSync(new URL('Cargo.lock', root)), false);
  assert.doesNotMatch(manifest, /\[\[bin\]\]|\[\[example\]\]/);
});
