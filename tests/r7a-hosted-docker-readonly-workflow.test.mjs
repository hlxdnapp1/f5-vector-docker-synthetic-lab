import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/r7a-hosted-real-docker-readonly.yml', import.meta.url), 'utf8'
);
const shell = readFileSync(
  new URL('../scripts/R7A-HOSTED-DOCKER-READONLY-PREFLIGHT.sh', import.meta.url), 'utf8'
);
const previousWorkflow = readFileSync(
  new URL('../.github/workflows/r6f-offline-review-manual.yml', import.meta.url), 'utf8'
);

test('R7A-01: workflow is manual only; no push/PR/schedule auto-run', () => {
  assert.match(workflow, /^on:\s*\n  workflow_dispatch:\s*$/m);
  assert.equal((workflow.match(/^  workflow_dispatch:/gm) ?? []).length, 1);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|pull_request_target|schedule|workflow_run|release|repository_dispatch):/m);
});

test('R7A-02: hosted public Linux x64 only, default-branch job gate, 8-min cap', () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 8/);
  assert.match(workflow, /github\.repository == 'hlxdnapp1\/f5-vector-docker-synthetic-lab'/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.match(workflow, /RUNNER_ENVIRONMENT.*github-hosted/);
  assert.match(workflow, /RUNNER_ARCH.*X64/);
  assert.doesNotMatch(workflow, /self-hosted|ubuntu-slim|ubuntu-latest/);
});

test('R7A-03: explicitly reviewed SHA and inert-by-default dispatch input', () => {
  assert.match(workflow, /default: DENY/);
  assert.match(workflow, /- HOST_READONLY_ONLY/);
  assert.match(workflow, /R7A_REVIEWED_COMMIT: \$\{\{ inputs\.reviewed_commit \}\}/);
  assert.match(workflow, /test "\$R7A_REVIEWED_COMMIT" = "\$GITHUB_SHA"/);
  assert.match(shell, /COMMIT_NOT_MATCHING_REVIEWED/);
  assert.match(shell, /GITHUB_REPOSITORY_VISIBILITY:-\}" == "public"/);
});

test('R7A-04: permissions read-only; checkout pinned, no token persistence', () => {
  assert.match(workflow, /permissions:\s*\n  contents: read/);
  assert.match(workflow, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /(?:secrets\.|id-token:\s*write|contents:\s*write|upload-artifact|aws-actions|actions\/cache)/);
});

test('R7A-05: Docker client is constrained to local Unix, no ambient override', () => {
  assert.match(shell, /NONLOCAL_DOCKER_ENDPOINT/);
  assert.match(shell, /unix:\/\/\/var\/run\/docker\.sock/);
  assert.match(shell, /LOCAL_UNIX_SOCKET_MISSING/);
  assert.match(shell, /DOCKER_ENV_OVERRIDE_PRESENT/);
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'DOCKER_TLS_VERIFY',
                     'DOCKER_CERT_PATH', 'DOCKER_API_VERSION']) {
    assert.match(shell, new RegExp(key));
  }
  assert.match(shell, /DOCKER_NOT_LINUX/);
  assert.match(shell, /DOCKER_ARCH_NOT_AMD64/);
});

test('R7A-06: no Docker mutations, image pull, Vector execution or HML networking', () => {
  const combined = workflow + '\n' + shell;
  assert.doesNotMatch(combined, /\b(?:docker|podman|nerdctl|supabase)\s+(?:run|create|start|stop|exec|kill|rm|rmi|prune|pull|build|login|compose|push|load|save)\b/i);
  assert.doesNotMatch(combined, /docker\.sock:(?:ro|rw)|--privileged|--network[ =]host|host\.docker\.internal|2375|2376/);
  assert.doesNotMatch(combined, /Sistema_Automacao_Comercial|f5solucoes\.net/);
  assert.match(shell, /VECTOR_BINARY=NOT_EXECUTED/);
  assert.match(shell, /DOCKER_MUTATIONS=0/);
  assert.match(shell, /EXATA_HML_AND_PRODUCTION=NO_GO/);
});

test('R7A-07: existing R6F offline manual workflow preserved and has two-file count gate', () => {
  assert.match(previousWorkflow, /name: R6F Public Synthetic Review \(manual only\)/);
  assert.match(previousWorkflow, /node --test --test-reporter=tap tests\/\*\.test\.mjs/);
  assert.match(previousWorkflow, /DOCKER_REAL=NOT_USED/);
  assert.match(previousWorkflow, /find \.github\/workflows -type f \| wc -l.*-eq 2/);
  assert.match(previousWorkflow, /test -f \.github\/workflows\/r7a-hosted-real-docker-readonly\.yml/);
});
