// release-it configuration. Releases normally run in the Release workflow
// (.github/workflows/release.yml); see RELEASE.md.
import process from 'node:process';

const ci = Boolean(process.env.CI);

export default {
  plugins: {
    '@release-it-plugins/lerna-changelog': {
      infile: 'CHANGELOG.md',
      // A local release opens the changelog in $EDITOR. In CI there is no
      // terminal, and the plugin opens the editor even with --ci.
      launchEditor: !ci,
    },
  },
  git: {
    tagName: 'v${version}',
  },
  github: {
    release: true,
    tokenRef: 'GITHUB_AUTH',
  },
  npm: {
    // CI publishes with npm trusted publishing (OIDC), which has no token,
    // so `npm whoami` and the collaborator check would fail.
    skipChecks: ci,
  },
};
