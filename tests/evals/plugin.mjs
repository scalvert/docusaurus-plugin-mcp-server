// MST plugin for outcome evals: can an agent follow this site's guides in a
// real Docusaurus site?
//
// - docs/client/claude-workspace runs Claude Code headless in a fresh copy of
//   a Docusaurus site per trial, connected to the docs site's MCP server
//   (`connect: "mcp"`) or with this repo's skills installed in the project
//   (`connect: "skills"`, what `npx skills add` gives). After the agent stops,
//   it kills anything the agent left running and runs the case's `after`
//   commands, recording their results in the workspace for the judge.
// - docs/judge/workspace grades what the agent left: those commands' exit
//   codes, files, the guides the site compiled, the commands the agent ran
//   (for steps it must leave to the user), and its answer.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { packPackage, startRegistryProcess } from './lib/local-registry.mjs';
import { prepareWorkspace, workspaceChanges } from './lib/workspaces.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheDir = path.join(repo, '.mcp-evals', 'cache');

/** The files a judge may read: what the guides tell the agent to create or change. */
const ARTIFACTS = [
  '.eval',
  'package.json',
  'docusaurus.config.js',
  'docs',
  'api',
  'netlify',
  'vercel.json',
  'netlify.toml',
  'wrangler.jsonc',
  'mcp-server.mjs',
  'mcp-worker.js',
  'build/mcp',
];

let registry;
/** Packs the checkout once per process and serves it. */
async function localRegistry() {
  registry ??= (async () => {
    if (!fs.existsSync(path.join(repo, 'dist', 'index.js'))) {
      throw new Error('Build the package first: npm run build');
    }
    const pkg = packPackage(repo, path.join(cacheDir, 'pack'));
    const log = path.join(cacheDir, 'registry.log');
    const server = await startRegistryProcess(pkg, { log });
    console.log(
      `[evals] Serving ${pkg.name}@${pkg.version} (packed from this checkout) at ${server.url}; requests logged to ${log}`
    );
    return { pkg, url: server.url };
  })();
  return registry;
}

/** Kills a detached process group: the agent's shell jobs, servers it left running. */
function killGroup(pid) {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

/** Runs one shell command in the workspace, in its own process group. */
function runAfter(command, cwd, timeoutMs) {
  const started = Date.now();
  const result = spawnSync('bash', ['-c', command], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      EVALS_DIR: path.join(repo, 'tests', 'evals'),
    },
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    command,
    exitCode: result.status ?? (result.signal ? 128 : 1),
    signal: result.signal ?? undefined,
    durationMs: Date.now() - started,
    output: output.length > 8000 ? `…${output.slice(-8000)}` : output,
  };
}

/** Claude Code's stream-json lines → MST trace events, answer, and usage. */
function parseStream(stdout) {
  const events = [];
  const byId = new Map();
  let finalText = '';
  let usage;
  let error;
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.type === 'assistant') {
      for (const block of message.message?.content ?? []) {
        if (block.type !== 'tool_use') continue;
        const mcp = /^mcp__(.+?)__(.+)$/.exec(block.name);
        const event = mcp
          ? {
              kind: 'tool_call',
              source: 'mcp',
              server: mcp[1],
              name: mcp[2],
              arguments: block.input ?? {},
            }
          : block.name === 'Skill'
            ? {
                kind: 'skill',
                source: 'builtin',
                name: String(
                  block.input?.skill ?? block.input?.command ?? block.input?.name ?? 'skill'
                ),
                arguments: block.input ?? {},
              }
            : {
                kind: 'tool_call',
                source: 'builtin',
                name: block.name,
                arguments: block.input ?? {},
              };
        event.id = block.id;
        event.rawName = block.name;
        events.push(event);
        byId.set(block.id, event);
      }
    } else if (message.type === 'user') {
      for (const block of message.message?.content ?? []) {
        if (block.type !== 'tool_result') continue;
        const event = byId.get(block.tool_use_id);
        if (!event) continue;
        const content = Array.isArray(block.content)
          ? block.content.map((part) => part.text ?? '').join('')
          : String(block.content ?? '');
        event.output = content.slice(0, 20_000);
        if (block.is_error !== undefined) event.isError = Boolean(block.is_error);
      }
    } else if (message.type === 'result') {
      finalText = String(message.result ?? '');
      if (message.is_error) error = finalText || message.subtype;
      usage = {
        inputTokens:
          (message.usage?.input_tokens ?? 0) +
          (message.usage?.cache_read_input_tokens ?? 0) +
          (message.usage?.cache_creation_input_tokens ?? 0),
        outputTokens: message.usage?.output_tokens ?? 0,
        ...(typeof message.total_cost_usd === 'number'
          ? { totalCostUsd: message.total_cost_usd }
          : {}),
      };
    }
  }
  return { events, finalText, usage, error };
}

/** Runs `claude -p` in the workspace; resolves when it exits or times out. */
function runClaude({ prompt, model, cwd, mcpConfig, timeoutMs }) {
  return new Promise((resolve) => {
    const args = [
      '-p',
      prompt,
      '--model',
      model,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'bypassPermissions',
      '--strict-mcp-config',
      '--mcp-config',
      JSON.stringify(mcpConfig),
    ];
    const child = spawn('claude', args, {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
        MCP_CONNECTION_NONBLOCKING: 'false',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child.pid);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      killGroup(child.pid);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Copies this repo's skills into the workspace, as `npx skills add` would. */
function installRepoSkills(workspace) {
  const target = path.join(workspace, '.claude', 'skills');
  const sources = [
    path.join(repo, 'skills', 'docusaurus-plugin-mcp-server'),
    ...fs
      .readdirSync(path.join(repo, 'skills', 'guides'))
      .map((name) => path.join(repo, 'skills', 'guides', name)),
  ];
  for (const source of sources) {
    fs.cpSync(source, path.join(target, path.basename(source)), { recursive: true });
  }
}

const clientSchema = z
  .object({
    type: z.literal('docs/client/claude-workspace').optional(),
    model: z.string().optional(),
    timeout: z.number().int().positive().optional(),
    /** Which site the trial starts from. */
    site: z.enum(['fresh', 'set-up']).default('fresh'),
    /** Files written over the site before the agent starts (relative path → content). */
    files: z.record(z.string(), z.string()).optional(),
    /**
     * How the agent gets the guides. Variants set it; a case's own
     * clientOptions merge key by key, so they keep the variant's.
     */
    connect: z.enum(['mcp', 'skills']).default('mcp'),
    /** Shell commands run in the workspace after the agent stops, for the judge. */
    after: z.array(z.string()).default([]),
  })
  .strict();

const checkSchema = z.union([
  z
    .object({
      label: z.string(),
      after: z.number().int().nonnegative(),
      exitCode: z.number().int().default(0),
      outputMatches: z.string().optional(),
    })
    .strict(),
  z
    .object({
      label: z.string(),
      file: z.string(),
      exists: z.boolean().default(true),
      matches: z.array(z.string()).default([]),
    })
    .strict(),
  z.object({ label: z.string(), noCommand: z.string() }).strict(),
  z.object({ label: z.string(), answerMatches: z.string() }).strict(),
  z
    .object({
      label: z.string(),
      guide: z
        .object({ minSteps: z.number().int().positive(), checks: z.boolean().default(true) })
        .strict(),
    })
    .strict(),
]);

/** Commands the agent ran, from its Bash tool calls. */
const commandsRun = (events) =>
  events
    .filter((event) => event.source === 'builtin' && event.name === 'Bash')
    .map((event) => String(event.arguments?.command ?? ''));

function grade(check, { dir, events, text }) {
  const read = (file) => {
    const full = path.join(dir, file);
    return fs.existsSync(full) && fs.statSync(full).isFile()
      ? fs.readFileSync(full, 'utf8')
      : undefined;
  };
  if ('after' in check) {
    const results = JSON.parse(read('.eval/after.json') ?? '[]');
    const result = results[check.after];
    if (!result) return `no result for after[${check.after}]`;
    if (result.exitCode !== check.exitCode)
      return `\`${result.command}\` exited ${result.exitCode}: ${result.output.slice(-600)}`;
    if (check.outputMatches && !new RegExp(check.outputMatches, 'm').test(result.output))
      return `\`${result.command}\` output doesn't match /${check.outputMatches}/`;
    return null;
  }
  if ('file' in check) {
    const content = read(check.file);
    if (!check.exists) return content === undefined ? null : `${check.file} exists`;
    if (content === undefined) return `${check.file} is missing`;
    const missing = check.matches.filter((pattern) => !new RegExp(pattern, 'm').test(content));
    return missing.length > 0
      ? `${check.file} doesn't match ${missing.map((p) => `/${p}/`).join(', ')}`
      : null;
  }
  if ('noCommand' in check) {
    const pattern = new RegExp(check.noCommand, 'm');
    const ran = commandsRun(events).filter((command) => pattern.test(command));
    return ran.length > 0
      ? `the agent ran ${ran.map((c) => `\`${c.slice(0, 200)}\``).join(', ')}`
      : null;
  }
  if ('answerMatches' in check) {
    return new RegExp(check.answerMatches, 'im').test(text)
      ? null
      : `the answer doesn't match /${check.answerMatches}/`;
  }
  if ('guide' in check) {
    const bundle = read('build/mcp/bundle.json');
    if (!bundle) return 'build/mcp/bundle.json is missing';
    const skills = JSON.parse(bundle).skills?.skills ?? [];
    const guides = skills.filter((skill) => skill.frontmatter?.metadata?.['agent-guide']);
    if (guides.length === 0) return 'the site compiled no agent guide';
    const problems = [];
    for (const guide of guides) {
      const skillMd = guide.files.find((file) => file.path === 'SKILL.md')?.text ?? '';
      const steps = skillMd.split(/^### \d+\. /m).slice(1);
      if (steps.length < check.guide.minSteps)
        problems.push(
          `${guide.skillPath}: ${steps.length} step(s), expected at least ${check.guide.minSteps}`
        );
      const unchecked = steps.filter((step) => !/^\*\*Check:\*\*/m.test(step)).length;
      if (check.guide.checks && unchecked > 0)
        problems.push(`${guide.skillPath}: ${unchecked} step(s) without a check`);
    }
    const manifest = JSON.parse(read('build/mcp/manifest.json') ?? '{}');
    for (const warning of manifest.guideWarnings ?? []) problems.push(`warning: ${warning}`);
    return problems.length > 0 ? problems.join('; ') : null;
  }
  return 'unknown check';
}

export default {
  meta: { name: 'docusaurus-plugin-mcp-server-evals', version: '1.0.0', namespace: 'docs' },
  clients: {
    'claude-workspace': {
      schema: clientSchema,
      evidence: 'structured',
      maxConcurrency: 1,
      async run(input, rawConfig) {
        const config = clientSchema.parse(rawConfig);
        const { pkg, url } = await localRegistry();
        const workRoot =
          process.env.MCP_EVAL_WORKROOT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-eval-'));
        const workspace = fs.mkdtempSync(path.join(workRoot, 'site-'));
        fs.rmSync(workspace, { recursive: true });
        prepareWorkspace({
          repo,
          cacheDir,
          pkg,
          registryUrl: url,
          site: config.site,
          files: config.files,
          dest: workspace,
        });

        const mcpServers = {};
        if (config.connect === 'mcp') {
          for (const server of input.servers) {
            if (server.transport !== 'http')
              throw new Error('claude-workspace connects to HTTP servers only');
            mcpServers[server.label ?? 'docs'] = { type: 'http', url: server.serverUrl };
          }
        } else {
          installRepoSkills(workspace);
        }

        const started = Date.now();
        const agent = await runClaude({
          prompt: input.prompt,
          model: config.model ?? 'sonnet',
          cwd: workspace,
          mcpConfig: { mcpServers },
          timeoutMs: config.timeout ?? 900_000,
        });
        const parsed = parseStream(agent.stdout);
        const durationMs = Date.now() - started;

        // What the agent left, then the case's own checks on it.
        const changes = workspaceChanges(workspace);
        fs.mkdirSync(path.join(workspace, '.eval'), { recursive: true });
        const after = config.after.map((command) => runAfter(command, workspace, 600_000));
        fs.writeFileSync(
          path.join(workspace, '.eval', 'config.json'),
          JSON.stringify(config, null, 2)
        );
        fs.writeFileSync(
          path.join(workspace, '.eval', 'after.json'),
          JSON.stringify(after, null, 2)
        );
        fs.writeFileSync(
          path.join(workspace, '.eval', 'changes.txt'),
          `${changes.status}\n${changes.diff}`
        );
        fs.writeFileSync(path.join(workspace, '.eval', 'stderr.txt'), agent.stderr.slice(-20_000));

        const error = agent.timedOut
          ? `Timed out after ${Math.round((config.timeout ?? 900_000) / 1000)}s`
          : agent.code !== 0 && !parsed.finalText
            ? `claude exited ${agent.code}: ${agent.stderr.slice(-500)}`
            : parsed.error;
        return {
          finalText: parsed.finalText,
          events: parsed.events,
          ...(parsed.usage ? { usage: parsed.usage } : {}),
          ...(error ? { error } : {}),
          durationMs,
          artifacts: {
            dir: workspace,
            include: ARTIFACTS.filter((entry) => fs.existsSync(path.join(workspace, entry))),
          },
        };
      },
    },
  },
  judges: {
    workspace: {
      description:
        'Grades the site an agent left: command results, files, compiled guides, commands it ran, its answer.',
      schema: z.object({ checks: z.array(checkSchema).min(1) }).strict(),
      async evaluate({ trial }, options) {
        if (!trial.artifactsDir)
          return { score: 0, pass: false, reasoning: 'The client reported no workspace.' };
        const results = options.checks.map((check) => ({
          check,
          problem: grade(check, {
            dir: trial.artifactsDir,
            events: trial.events,
            text: trial.text,
          }),
        }));
        const failed = results.filter((r) => r.problem !== null);
        return {
          score: (results.length - failed.length) / results.length,
          pass: failed.length === 0,
          reasoning:
            failed.length === 0
              ? `All ${results.length} checks passed.`
              : failed.map((r) => `${r.check.label}: ${r.problem}`).join('\n'),
          subScores: Object.fromEntries(
            results.map((r) => [
              r.check.label,
              {
                score: r.problem ? 0 : 1,
                pass: !r.problem,
                ...(r.problem ? { reasoning: r.problem } : {}),
              },
            ])
          ),
        };
      },
    },
  },
};
