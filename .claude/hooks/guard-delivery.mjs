import { readFileSync } from 'node:fs';
import { isUnfinished, listRuns, validateState } from './sdlc-lib.mjs';

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `SDLC guard: ${reason}`,
    },
  }));
  process.exit(0);
}

const baseName = (token) => token.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
const tokenize = (segment) => (segment.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));

function classifyShell(command) {
  const actions = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = tokenize(segment);
    const gitAt = tokens.findIndex((t) => baseName(t) === 'git');
    if (gitAt !== -1) {
      let i = gitAt + 1;
      while (i < tokens.length && tokens[i].startsWith('-')) {
        i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(tokens[i]) ? 2 : 1;
      }
      const sub = tokens[i];
      const rest = tokens.slice(i + 1);
      if (sub === 'commit') actions.push({ approval: 'commit', what: 'git commit' });
      if (sub === 'push') {
        if (rest.some((t) => /^(-f|--force|--force-with-lease(=.*)?|--delete|-d|--mirror)$/.test(t) || /^[+:]/.test(t))) {
          deny('force, delete and mirror pushes are never allowed.');
        }
        actions.push({ approval: 'push', what: 'git push' });
      }
    }
    const ghAt = tokens.findIndex((t) => baseName(t) === 'gh');
    if (ghAt !== -1 && tokens[ghAt + 1] === 'pr') {
      const verb = tokens[ghAt + 2];
      if (verb === 'merge') deny('merging is done by the user after review, not by the workflow.');
      if (['create', 'edit', 'ready', 'close', 'reopen', 'comment'].includes(verb)) {
        actions.push({ approval: 'pr', what: `gh pr ${verb}` });
      }
    }
  }
  return actions;
}

function classifyMcp(toolName, input) {
  const [, server = '', ...rest] = toolName.split('__');
  const tool = rest.join('__');
  if (/atlassian/i.test(server)) {
    if (/^(create|edit|update|add|delete|transition|assign|remove|link|move|executeWrite|executeDestructive)/i.test(tool)) {
      deny('Jira and Confluence are read-only in this workflow.');
    }
    return [];
  }
  if (/github/i.test(server)) {
    const isWrite = /^(create|update|delete|merge|push|add|fork|assign|close|reopen|submit|dismiss|remove|edit|request|rerun|cancel|enable|disable|set)/.test(tool)
      || /_write$/.test(tool);
    if (!isWrite) return [];
    if (/^merge/.test(tool) || input?.method === 'merge') deny('merging is done by the user after review, not by the workflow.');
    return [{ approval: 'pr', what: `GitHub ${tool}`, input }];
  }
  return [];
}

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf8').replace(/^﻿/, ''));
} catch {
  process.exit(0);
}

const { tool_name: toolName = '', tool_input: input = {} } = event;
const actions = toolName.startsWith('mcp__')
  ? classifyMcp(toolName, input)
  : typeof input.command === 'string' ? classifyShell(input.command) : [];
if (actions.length === 0) process.exit(0);

const runs = listRuns().filter(isUnfinished);
const run = runs[0];
if (!run) deny(`${actions[0].what} needs an active SDLC run. Start one with /run-sdlc <KEY>.`);
if (!run.state) deny(`artifacts/${run.key}/state.json is not valid JSON.`);
const problems = validateState(run.state);
if (problems.length) deny(`state.json for ${run.key} is invalid: ${problems[0]}`);

for (const action of actions) {
  const approval = run.state.approvals?.[action.approval];
  if (approval?.approved !== true) {
    deny(`${action.what} needs the user's explicit approval recorded in artifacts/${run.key}/state.json (approvals.${action.approval}). Show the target and ask first.`);
  }
  if (action.input) {
    const { owner, repo, base, head } = action.input;
    if (owner && repo && `${owner}/${repo}`.toLowerCase() !== run.state.repo.toLowerCase()) {
      deny(`target ${owner}/${repo} differs from the approved repository ${run.state.repo}.`);
    }
    if (base && base !== run.state.base) deny(`base "${base}" differs from the approved base "${run.state.base}".`);
    if (head && run.state.branch && head !== run.state.branch) {
      deny(`head "${head}" differs from the approved branch "${run.state.branch}".`);
    }
  }
}
process.exit(0);
