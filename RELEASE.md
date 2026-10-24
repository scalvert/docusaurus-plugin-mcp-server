# Release Process

Releases are mostly automated using
[release-it](https://github.com/release-it/release-it/) and
[lerna-changelog](https://github.com/lerna/lerna-changelog/).

## Preparation

Since the majority of the actual release process is automated, the primary
remaining task prior to releasing is confirming that all pull requests that
have been merged since the last release have been labeled with the appropriate
`lerna-changelog` labels and the titles have been updated to ensure they
represent something that would make sense to our users. Some great information
on why this is important can be found at
[keepachangelog.com](https://keepachangelog.com/en/1.0.0/), but the overall
guiding principle here is that changelogs are for humans, not machines.

When reviewing merged PR's the labels to be used are:

* breaking - Used when the PR is considered a breaking change.
* enhancement - Used when the PR adds a new feature or enhancement.
* bug - Used when the PR fixes a bug included in a previous release.
* documentation - Used when the PR adds or updates documentation.
* internal - Used for internal changes that still require a mention in the
  changelog/release notes.

## Release

Releases run in the Release workflow (`.github/workflows/release.yml`). It
publishes to npm with [trusted publishing][trusted-publishing], so it needs no
npm token and no one-time password.

1. Check the labels and titles of the pull requests since the last release
   (see Preparation). The changelog is generated from them, and the workflow
   has no editor step to fix it afterwards.
2. Do a dry run, and read the changelog in the run's log:

   ```sh
   gh workflow run release.yml -f increment=minor -f dry_run=true
   ```

3. Release:

   ```sh
   gh workflow run release.yml -f increment=minor
   ```

4. Check the result: the run succeeded (`gh run watch`),
   `npm view docusaurus-plugin-mcp-server version` shows the new version, the
   GitHub release exists, and the Deploy website run for the new tag succeeded.

The workflow runs `npx release-it <increment> --ci`. That bumps the version and
publishes to npm (`prepublishOnly` builds and tests first). Then it commits
`Release <version>`, tags `v<version>`, pushes both to `main`, creates the
GitHub release, and comments on the pull requests it includes. Last, the
workflow starts the docs deploy, because a tag pushed with `GITHUB_TOKEN`
doesn't trigger other workflows.

A pull request that changes `release.yml` or `.release-it.js` gets a dry run.

[trusted-publishing]: https://docs.npmjs.com/trusted-publishers

### One-time setup

- On npmjs.com, the package's Settings have a GitHub Actions trusted publisher
  with owner `scalvert`, repository `docusaurus-plugin-mcp-server`, workflow
  `release.yml`, environment `npm`, and "npm publish" allowed.
- The repository has an `npm` environment that deploys only from `main`.
- Publishing access is "Require two-factor authentication and disallow
  tokens". Trusted publishing still works with that setting.

### If a release fails after publishing

release-it publishes to npm before it commits and tags. If a later step fails,
npm has the new version and GitHub doesn't. Don't rerun the workflow: it would
try to publish the same version again, and npm versions can't be republished.
Finish the GitHub side from an up-to-date checkout of `main` instead. This is
the command in fish; `CI=true` turns off the changelog editor and the npm
checks:

```sh
env CI=true GITHUB_AUTH=(gh auth token) npx release-it <version> --no-npm.publish
```

That push comes from your account rather than `GITHUB_TOKEN`, so the tag starts
the docs deploy by itself.

### From a laptop

`npx release-it` still works locally. It opens the changelog in `$EDITOR`
before it commits, and npm asks for your one-time password when it publishes.
It needs `GITHUB_AUTH` set to a GitHub token with the `repo` scope.
