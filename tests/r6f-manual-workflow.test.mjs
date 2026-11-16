import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const yaml=readFileSync(new URL('../.github/workflows/r6f-offline-review-manual.yml',import.meta.url),'utf8');

test('R6F-CI-01: only workflow_dispatch manual trigger exists',()=>{
 assert.match(yaml,/^on:\s*\n  workflow_dispatch:\s*$/m);
 assert.equal((yaml.match(/^  workflow_dispatch:/gm)||[]).length,1);
 assert.doesNotMatch(yaml,/^  (?:push|pull_request|pull_request_target|schedule|workflow_run|release):/m);
});
test('R6F-CI-02: hosted standard public Ubuntu with timeout and repo/ref guard',()=>{
 assert.match(yaml,/runs-on: ubuntu-24\.04/);
 assert.match(yaml,/timeout-minutes: 10/);
 assert.match(yaml,/RUNNER_ENVIRONMENT.*github-hosted/);
 assert.match(yaml,/github\.repository == 'hlxdnapp1\/f5-vector-docker-synthetic-lab'/);
 assert.match(yaml,/github\.ref == 'refs\/heads\/main'/);
});
test('R6F-CI-03: immutable official checkout and no persisted token',()=>{
 assert.match(yaml,/actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
 assert.match(yaml,/persist-credentials: false/);
 assert.match(yaml,/permissions:\s*\n  contents: read/);
 assert.doesNotMatch(yaml,/id-token:\s*write|contents:\s*write/);
});
test('R6F-CI-04: job runs offline Node only, no Docker daemon or billable action',()=>{
 assert.match(yaml,/node --test --test-reporter=tap tests\/\*\.test\.mjs/);
 assert.match(yaml,/DOCKER_REAL=NOT_USED/);
 assert.doesNotMatch(yaml,/\b(?:docker|podman|nerdctl|supabase)\s+(?:run|pull|create|start|stop|exec|build|compose|info|ps|version)\b/);
 assert.doesNotMatch(yaml,/curl\s|wget\s|sudo\s|\bdocker\s+login\b/);
});
test('R6F-CI-05: no secrets, private EXATA checkout or uncontrolled storage',()=>{
 assert.doesNotMatch(yaml,/secrets\.|\b(?:upload-artifact|self-hosted|ubuntu-slim|aws-actions|actions\/cache)\b/);
 assert.doesNotMatch(yaml,/Sistema_Automacao_Comercial|f5solucoes\.net|host\.docker\.internal/);
 assert.match(yaml,/DOCKER_CONTEXT:-/);
});
