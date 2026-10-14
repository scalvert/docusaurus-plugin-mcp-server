#!/usr/bin/env node
// Runs one eval in tests/evals/<name>/eval.json against this repo's docs site
// and prints, per case, whether it passed and what each trial used.
//
//   node tests/evals/run.mjs <guide-discovery|guide-outcomes> [--case id ...]
//     [--variant name ...] [--trials N] [--dry-run] [--keep]
//
// Needs the package and the site built (npm run build && (cd website && npm
// run build)). The site's MCP function (website/api/mcp.mjs) is served on
// localhost:3458 for the run. --keep leaves the trials' sites in place.
//
// Outcome evals (guide-outcomes) give each trial its own Docusaurus site, under
// a temporary directory the runner removes afterwards; see plugin.mjs.
//
// Claude Code runs with bypassPermissions, so it never runs in this repo: the
// claude-code client (discovery) starts it in an empty directory of its own,
// and plugin.mjs (outcomes) in the trial's site. It can't read or change this
// repo, and only learns what the MCP server or the installed skills tell it.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runEval } from '@gleanwork/mcp-server-tester/evals';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3458;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    case: { type: 'string', multiple: true },
    variant: { type: 'string', multiple: true },
    trials: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
});
const name = positionals[0];
const configPath = name && path.join(repo, 'tests', 'evals', name, 'eval.json');
if (!configPath || !fs.existsSync(configPath)) {
  const evals = fs
    .readdirSync(path.join(repo, 'tests', 'evals'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  console.error(
    `Usage: node tests/evals/run.mjs <${evals.join('|')}> [--case id ...] [--variant name ...] [--trials N] [--dry-run] [--keep]`
  );
  process.exit(2);
}
const trialCount = values.trials === undefined ? undefined : Number(values.trials);
if (trialCount !== undefined && !(Number.isInteger(trialCount) && trialCount > 0)) {
  console.error(`--trials must be a positive whole number, not "${values.trials}"`);
  process.exit(2);
}
if (!fs.existsSync(path.join(repo, 'website', 'build', 'mcp', 'bundle.json'))) {
  console.error(
    'No website/build/mcp/bundle.json. Build the site first: cd website && npm run build'
  );
  process.exit(2);
}
if (!fs.existsSync(path.join(repo, 'dist', 'index.js'))) {
  console.error('No dist/. Build the package first: npm run build');
  process.exit(2);
}

/** Whether anything answers the MCP status check on PORT. */
async function siteServerAnswers() {
  try {
    return (await fetch(`http://localhost:${PORT}/mcp`)).ok;
  } catch {
    return false;
  }
}

/**
 * Starts website/scripts/serve-mcp.mjs and waits for its status check. Refuses
 * a port that's already taken: a server left from an earlier run would answer
 * with the bundle it loaded then, and the eval would grade an old build.
 */
async function startSiteServer() {
  if (await siteServerAnswers())
    throw new Error(
      `Something already answers on http://localhost:${PORT}/mcp, probably a site server from an earlier run or npm run test:site. Stop it and run again.`
    );
  const child = spawn(process.execPath, [path.join(repo, 'website', 'scripts', 'serve-mcp.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`The site's MCP server exited (${child.exitCode}) before it started`);
    try {
      const status = await fetch(`http://localhost:${PORT}/mcp`);
      if (status.ok) return child;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill();
  throw new Error(`The site's MCP server didn't start on port ${PORT}`);
}

/** One line per trial: what the agent read and used, from the trace's events. */
function describeTrial(trace) {
  const used = [];
  for (const event of trace?.events ?? []) {
    const args = event.arguments ?? {};
    if (event.kind === 'skill') used.push(`skill ${event.name}`);
    else if (event.name === 'docs_fetch')
      used.push(
        `fetch ${String(args.url).replace('https://docusaurus-plugin-mcp-server.vercel.app', '')}`
      );
    else if (event.name === 'docs_search') used.push(`search "${args.query}"`);
    else if (event.name === 'Bash')
      used.push(`$ ${String(args.command).split('\n')[0].slice(0, 80)}`);
    else if (['Read', 'Write', 'Edit'].includes(event.name))
      used.push(`${event.name.toLowerCase()} ${path.basename(String(args.file_path ?? ''))}`);
    else used.push(`${event.source === 'mcp' ? '' : `${event.source ?? 'client'}:`}${event.name}`);
  }
  return used.length > 0 ? used.join(' → ') : '(no tools)';
}

const outputDir = path.join(repo, '.mcp-evals', name);
const server = values['dry-run'] ? undefined : await startSiteServer();
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), `mcp-eval-${name}-`));
process.env.MCP_EVAL_WORKROOT = workdir;
// Clean up on exit, including Ctrl-C: exiting on the signal also runs the
// local registry's exit handler (lib/local-registry.mjs), which stops it.
process.once('exit', () => {
  server?.kill();
  if (values.keep) console.log(`Kept the trials' sites in ${workdir}`);
  else fs.rmSync(workdir, { recursive: true, force: true });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(130));
try {
  const result = await runEval({
    configPath,
    outputDir,
    dryRun: values['dry-run'],
    ...(values.case ? { cases: values.case } : {}),
    ...(values.variant ? { variant: values.variant } : {}),
    ...(trialCount ? { trials: trialCount } : {}),
  });
  if (values['dry-run']) {
    console.log(
      `${result.evalConfig.name}: ${result.datasets.map((d) => d.dataset?.cases.length ?? 0).join('+')} case(s), valid`
    );
  } else {
    let failed = 0;
    for (const { result: run } of result.datasets) {
      for (const caseResult of run?.caseResults ?? []) {
        if (!caseResult.pass) failed++;
        const trials = caseResult.trialResults ?? [caseResult];
        const passedTrials = trials.filter((trial) => trial.pass).length;
        const variant = caseResult.variant ? ` [${caseResult.variant}]` : '';
        console.log(
          `${caseResult.pass ? '✓' : '✗'} ${caseResult.id}${variant}  (${passedTrials}/${trials.length} trials)`
        );
        trials.forEach((trial, index) => {
          console.log(`    ${trial.pass ? '✓' : '✗'} ${index}: ${describeTrial(trial.trace)}`);
          if (!trial.pass) {
            const graders =
              trial.scores ?? (trials.length === 1 ? caseResult.scores : undefined) ?? {};
            for (const [grader, outcome] of Object.entries(graders)) {
              if (outcome && outcome.pass === false) {
                const why = String(outcome.reasoning ?? outcome.details ?? 'failed')
                  .trim()
                  .split('\n');
                console.log(`        ${grader}: ${why.slice(0, 6).join('\n          ')}`);
              }
            }
            if (trial.error) console.log(`        error: ${String(trial.error).slice(0, 300)}`);
          }
        });
      }
    }
    console.log(`\nResults: ${outputDir}/runs/ (open report/index.html in a run)`);
    process.exitCode = failed > 0 ? 1 : 0;
  }
} finally {
  // The running child keeps the process alive; the exit handler does the rest.
  server?.kill();
}
