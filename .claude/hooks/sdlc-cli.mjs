import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  artifactsDir, DEFAULT_BASE, DEFAULT_REPO, drift, hashFile, isUnfinished, listRuns, newState, validateState,
} from './sdlc-lib.mjs';

const [command, ...args] = process.argv.slice(2);
const keyPattern = /^[A-Z][A-Z0-9_]*-\d+$/i;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function summarize(run) {
  if (!run.state) return `${run.key}: state.json is invalid JSON`;
  const open = Object.entries(run.state.stages).find(([, stage]) => stage.status !== 'approved');
  return `${run.key}: phase ${run.state.phase}, ${open ? `${open[0]} is ${open[1].status}` : 'all stages approved'}${run.state.prUrl ? `, PR ${run.state.prUrl}` : ''}`;
}

if (command === 'init') {
  const key = (args[0] || '').toUpperCase();
  if (!keyPattern.test(key)) fail('usage: init <ISSUE-KEY> [repo] [base]');
  const dir = join(artifactsDir, key);
  if (existsSync(join(dir, 'state.json'))) fail(`artifacts/${key}/state.json already exists; resume instead.`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), `${JSON.stringify(newState(key, args[1] || DEFAULT_REPO, args[2] || DEFAULT_BASE), null, 2)}\n`);
  writeFileSync(join(dir, 'log.md'), `# ${key} SDLC log\n\n| Timestamp | Stage | Deliverable | Result |\n| --- | --- | --- | --- |\n`);
  console.log(`Initialized artifacts/${key}/ (state.json, log.md)`);
} else if (command === 'status') {
  const runs = listRuns().filter(isUnfinished);
  console.log(runs.length ? runs.map(summarize).join('\n') : 'No unfinished runs.');
} else if (command === 'verify') {
  const key = (args[0] || '').toUpperCase();
  const run = listRuns().find((r) => r.key.toUpperCase() === key);
  if (!run) fail(`No run found for ${key}.`);
  if (!run.state) fail(`artifacts/${run.key}/state.json is not valid JSON.`);
  const problems = [...validateState(run.state), ...drift(run.key, run.state)];
  console.log(summarize(run));
  console.log(problems.length ? `Problems:\n- ${problems.join('\n- ')}` : 'State is valid; no approved artifact has drifted.');
} else if (command === 'hash') {
  if (!args[0] || !existsSync(args[0])) fail('usage: hash <file>');
  console.log(hashFile(args[0]));
} else {
  fail('usage: sdlc-cli.mjs <init ISSUE-KEY [repo] [base] | status | verify ISSUE-KEY | hash FILE>');
}
