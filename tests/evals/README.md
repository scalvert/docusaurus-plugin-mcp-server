# Evals for the docs site's guides

These evals check that the agent guides on the docs site work for an agent. The contract tests (`npm run test:site`) check that every guide is served, links only to things that exist, and is found by search. The evals check what the tests can't: whether an agent picks the right guide, and whether following it leaves a working site.

| Eval | Question | Graded by |
| --- | --- | --- |
| `guide-discovery` | Connected only to the site's MCP server, does an agent answer a question with the guide that covers it? | The answer carries facts only that guide gives (`matchesPattern`), and the agent called a tool |
| `guide-outcomes` | Following a guide in a real Docusaurus site, does the agent leave the site working? | `docs/judge/workspace`: commands run on the site afterwards, files, the guides it compiles, and the commands the agent ran |

Both use [MST](https://github.com/gleanwork/mcp-server-tester) (`@gleanwork/mcp-server-tester`) eval configs: `<name>/eval.json` and `<name>/dataset.json`.

## Running them

Build the package and the site, then run an eval by name:

```bash
npm run build && (cd website && npm run build)
npm run evals -- guide-discovery
npm run evals -- guide-outcomes --case setup --variant mcp
```

| Option | Does |
| --- | --- |
| `--case <id>` | Run only this case (repeatable) |
| `--variant <name>` | Run only this variant (repeatable) |
| `--trials <n>` | Trials per case, instead of the eval config's |
| `--dry-run` | Validate the eval config, dataset, and plugin; run nothing |
| `--keep` | Keep each trial's site (outcome evals) and print where |

The runner serves the site's MCP function (`website/api/mcp.mjs`) on `localhost:3458`, runs the eval, and prints each case with what every trial read and ran:

```text
✓ deploy-vercel  (3/3 trials)
    ✓ 0: fetch skill://deploy-docusaurus-mcp-vercel/SKILL.md
```

Each run is saved in `.mcp-evals/<name>/runs/<run-id>/` in MST's `mst.run/v1` format, with full traces (`redactStoredResponses: false`), and `report/index.html`, the run's report. Outcome runs also keep what the judge read for each trial, under `artifacts/<variant>/<case>/<trial>/`: the site's changed files, `.eval/after.json` (the after commands' output), and `.eval/changes.txt` (the agent's diff).

## What they need, and what they cost

- **Claude Code, signed in.** The agent is `claude -p` on your account, with your Claude Code settings (`isolate: false` in `guide-discovery`; the outcome client always uses them). `--strict-mcp-config` limits it to the docs server, so your other MCP servers aren't used, but your installed skills and plugins load.
- **macOS or Linux.** The outcome plugin runs commands with `bash` and stops what they leave running by process group, so the evals don't run on Windows.
- **Not in CI.** The evals use your login, and an outcome trial takes several minutes. A full `guide-discovery` run is 24 Claude Code sessions; `guide-outcomes` is 8 longer ones.
- **An empty directory.** Claude Code runs with `bypassPermissions`, so it never runs in this repository. The `claude-code` client starts it in an empty temporary directory of its own (discovery), and the plugin starts it in the trial's own site (outcomes). It learns only what the MCP server or the installed skills tell it.

## The outcome evals

The plugin (`plugin.mjs`) adds a client and a judge:

- **`docs/client/claude-workspace`** gives each trial its own copy of a Docusaurus site and runs Claude Code in it, connected to the site's MCP server (variant `mcp`) or with this repo's skills installed in the project, as `npx skills add` would install them (variant `skills`). When the agent stops, it kills whatever the agent left running, then runs the case's `after` commands on the site.
- **`docs/judge/workspace`** passes a trial when every check in the case does: an `after` command's exit code and output, a file and what it contains, the guides the site compiled (steps, checks, no warnings), commands the agent must not run (a deploy the guide leaves to the user), and the answer.

Sites come from two templates, built once and cached in `.mcp-evals/cache/`:

- `fresh`: `create-docusaurus` (classic, JavaScript), at the docs site's Docusaurus version.
- `set-up`: fresh, plus this package installed, configured, and built, as the setup guide leaves a site. The package is packed from this checkout and installed from a local registry (`lib/local-registry.mjs`), so cases that start here run the code in the checkout. The template is rebuilt when the packed package changes.

The agent's own `npm install` uses the public registry. Claude Code's Bash tool loads your shell configuration, and a wrapper such as Socket Firewall (`sfw`) allows only the public registry, so trials don't point npm at the local one. The `setup` case therefore installs the published package.

## Adding a case

- **Discovery:** a question someone would ask, and `matchesPattern` for facts only the right guide gives (a file name, a config key), not words any answer would use.
- **Outcome:** the task, the site it starts from (`site`, and `files` to write over it, such as a page to mark up or a broken config to fix), the `after` commands that prove the result, and the judge's checks. Check what the guide promises, not how the agent got there. For a step a guide marks as needing the user, add a `noCommand` check.

Run a new case a few times (`--trials 3`) before relying on it.
