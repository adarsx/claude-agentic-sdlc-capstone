import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STAGES = [
  ['requirements', 'requirements.md'],
  ['architecture', 'architecture.md'],
  ['design-review', 'design-review.md'],
  ['impl-plan', 'impl-plan.md'],
  ['implementation', null],
  ['code-review', 'code-review.md'],
  ['verification', 'verification-report.md'],
  ['pr-delivery', 'pull-request.md'],
];
export const STATUSES = new Set(['pending', 'in-progress', 'awaiting-approval', 'approved', 'blocked']);
export const PHASES = new Set(['PLAN', 'ASK', 'IMPLEMENT']);
export const DEFAULT_REPO = 'adarsx/claude-agentic-sdlc-capstone';
export const DEFAULT_BASE = 'main';

export const projectRoot = resolve(
  process.env.CLAUDE_PROJECT_DIR || fileURLToPath(new URL('../../', import.meta.url)),
);
export const artifactsDir = join(projectRoot, 'artifacts');

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));

export function hashFile(path) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(text).digest('hex');
}

export function newState(key, repo = DEFAULT_REPO, base = DEFAULT_BASE) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    issueKey: key,
    title: null,
    repo,
    base,
    branch: null,
    phase: 'PLAN',
    currentStage: STAGES[0][0],
    stages: Object.fromEntries(STAGES.map(([stage, artifact]) => [
      stage,
      { status: 'pending', artifact, approvedAt: null, approvalNote: null },
    ])),
    approvals: { stack: null, commit: null, push: null, pr: null },
    hashes: { 'requirements.md': null, 'architecture.md': null },
    tasks: [],
    testEvidence: [],
    blockers: [],
    decisions: [],
    prUrl: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function listRuns() {
  if (!existsSync(artifactsDir)) return [];
  return readdirSync(artifactsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(artifactsDir, entry.name, 'state.json');
      if (!existsSync(path)) return null;
      let state = null;
      try { state = readJson(path); } catch { /* reported as invalid */ }
      return { key: entry.name, path, state, mtime: statSync(path).mtimeMs };
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

export const isUnfinished = (run) => !run.state
  || run.state.stages?.['pr-delivery']?.status !== 'approved';

export function validateState(state) {
  const problems = [];
  if (!state || typeof state !== 'object') return ['state.json is not a JSON object'];
  if (!PHASES.has(state.phase)) problems.push(`phase must be one of ${[...PHASES].join(', ')}`);
  if (!state.stages) return [...problems, 'stages is missing'];

  const statuses = STAGES.map(([stage]) => {
    const status = state.stages[stage]?.status;
    if (!STATUSES.has(status)) problems.push(`stage "${stage}" has missing or invalid status`);
    return status;
  });
  const firstOpen = statuses.findIndex((status) => status !== 'approved');
  if (firstOpen !== -1) {
    statuses.slice(firstOpen + 1).forEach((status, offset) => {
      if (status !== 'pending') {
        problems.push(`stage "${STAGES[firstOpen + 1 + offset][0]}" is ${status} but "${STAGES[firstOpen][0]}" is not approved`);
      }
    });
  }
  if (!STAGES.some(([stage]) => stage === state.currentStage)) problems.push('currentStage is not a valid stage key');
  for (const name of ['stack', 'commit', 'push', 'pr']) {
    const value = state.approvals?.[name];
    if (value !== null && value !== undefined && value.approved !== true) {
      problems.push(`approvals.${name} must be null or contain approved: true`);
    }
  }
  return problems;
}

export function drift(key, state) {
  const found = [];
  for (const [stage, file] of [['requirements', 'requirements.md'], ['architecture', 'architecture.md']]) {
    const expected = state.hashes?.[file];
    const path = join(artifactsDir, key, file);
    if (state.stages?.[stage]?.status === 'approved' && expected && existsSync(path) && hashFile(path) !== expected) {
      found.push(`${file} changed after it was approved`);
    }
  }
  return found;
}
