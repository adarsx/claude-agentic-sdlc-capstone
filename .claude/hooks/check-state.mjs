import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { drift, projectRoot, readJson, validateState } from './sdlc-lib.mjs';

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿/, ''));
} catch {
  process.exit(0);
}

const filePath = event.tool_input?.file_path;
if (typeof filePath !== 'string') process.exit(0);

const projectPath = relative(projectRoot, resolve(event.cwd || projectRoot, filePath)).replaceAll('\\', '/');
const match = /^artifacts\/([^/]+)\/(.+)$/.exec(projectPath);
if (!match) process.exit(0);

const [, key, name] = match;
let warning;
if (name === 'state.json') {
  try {
    const problems = validateState(readJson(resolve(projectRoot, projectPath)));
    if (problems.length) warning = `state.json problems: ${problems.join('; ')}.`;
  } catch {
    warning = 'state.json is not valid JSON.';
  }
} else if (name === 'requirements.md' || name === 'architecture.md') {
  try {
    const state = readJson(resolve(projectRoot, 'artifacts', key, 'state.json'));
    const changed = drift(key, state);
    if (changed.length) {
      warning = `${changed.join('; ')}. Pause: tell the user what changed, then follow the scope-change rule (re-approve this stage, reset later stages to pending).`;
    }
  } catch {
    // no valid state yet
  }
}

if (warning) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `Check ${projectPath}. ${warning}` },
  }));
}
