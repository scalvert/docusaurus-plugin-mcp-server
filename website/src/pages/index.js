import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

const features = [
  {
    title: 'Built from your rendered pages',
    description:
      'At build time the plugin reads the HTML Docusaurus produced, so MDX and React component output are indexed exactly as readers see them.',
  },
  {
    title: 'Search and fetch tools',
    description: (
      <>
        Agents get <code>docs_search</code> (BM25 ranking, no external service) and{' '}
        <code>docs_fetch</code> (any page as clean Markdown with a table of contents).
      </>
    ),
  },
  {
    title: 'Runs on any serverless runtime',
    description:
      'One web-standard handler for Vercel, Netlify, Cloudflare Workers, Deno, and Bun, plus a Node adapter for Express and local development.',
  },
  {
    title: 'MCP 2026-07-28 and earlier',
    description:
      'Stateless modern protocol, with clients on 2025-era revisions served from the same endpoint.',
  },
  {
    title: 'Agent Skills included',
    description:
      'Ships a docs-research skill generated from your site, and serves your own skills over the MCP skills extension.',
  },
  {
    title: 'Install button for readers',
    description:
      'A navbar dropdown with ready-to-copy configs for Claude, Cursor, VS Code, and other MCP clients.',
  },
];

function Hero() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.hero)}>
      <div className="container">
        <img
          className={styles.heroLogo}
          src={useBaseUrl('/img/logo.svg')}
          alt="The Docusaurus dinosaur hugging the MCP logo"
          width={120}
          height={120}
        />
        <Heading as="h1" className={clsx('hero__title', styles.heroTitle)}>
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started">
            Get started
          </Link>
          <Link
            className={clsx('button button--outline button--lg', styles.heroOutline)}
            to="/docs/deploy"
          >
            Deploy guides
          </Link>
        </div>
      </div>
    </header>
  );
}

function Features() {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className="row">
          {features.map(({ title, description }) => (
            <div key={title} className={clsx('col col--4', styles.feature)}>
              <Heading as="h3">{title}</Heading>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AddToSite() {
  return (
    <section className={clsx(styles.section, styles.sectionAlt)}>
      <div className={clsx('container', styles.narrow)}>
        <Heading as="h2">Add it to your site</Heading>
        <p>Install the plugin, add it to your config, and serve the bundle it builds at /mcp.</p>
        <CodeBlock language="bash">npm install docusaurus-plugin-mcp-server</CodeBlock>
        <CodeBlock language="js" title="docusaurus.config.js">
          {`export default {
  url: 'https://docs.example.com',
  plugins: [['docusaurus-plugin-mcp-server', { server: { name: 'my-docs' } }]],
};`}
        </CodeBlock>
        <CodeBlock language="js" title="api/mcp.mjs">
          {`import { createWebRequestHandler } from 'docusaurus-plugin-mcp-server/adapters';
import bundle from '../build/mcp/bundle.json' with { type: 'json' };

export default {
  fetch: createWebRequestHandler({ artifacts: bundle }),
};`}
        </CodeBlock>
        <p>
          <Link to="/docs/getting-started">Getting started</Link> walks through it, and the{' '}
          <Link to="/docs/deploy">deploy guides</Link> cover Vercel, Netlify, Cloudflare Workers,
          Deno, Bun, Node.js, and static hosts.
        </p>
      </div>
    </section>
  );
}

function TryIt() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <section className={styles.section}>
      <div className={clsx('container', styles.narrow)}>
        <Heading as="h2">Try it on these docs</Heading>
        <p>
          This site is built with the plugin. Connect your agent to its endpoint and ask it how to
          set the plugin up.
        </p>
        <CodeBlock language="bash">
          {`claude mcp add --transport http docusaurus-plugin-mcp-server \\
  ${siteConfig.url}/mcp`}
        </CodeBlock>
        <p>
          For Cursor, VS Code, Codex, and other clients, use the <strong>Install MCP</strong> button
          in the navbar.
        </p>
      </div>
    </section>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="Serve your docs over MCP" description={siteConfig.tagline}>
      <Hero />
      <main>
        <Features />
        <AddToSite />
        <TryIt />
      </main>
    </Layout>
  );
}
