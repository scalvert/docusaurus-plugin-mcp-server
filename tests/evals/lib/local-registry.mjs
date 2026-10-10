// A local npm registry for outcome evals: it serves this package from a
// tarball packed from the checkout, and proxies every other request to
// registry.npmjs.org. The `set-up` site template installs from it, so trials
// that start from a set-up site run the code in this checkout (see
// workspaces.mjs for why the agent's own installs don't use it).
//
// The registry runs in its own process (startRegistryProcess): the eval
// process makes synchronous npm calls while preparing sites, which would block
// a server running in it.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'https://registry.npmjs.org';

/**
 * Packs the package at `repo` into `outDir` (it must be built: `npm run build`).
 * @returns {{ name: string, version: string, file: string, integrity: string, shasum: string, manifest: Record<string, unknown> }}
 */
export function packPackage(repo, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', outDir], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  );
  const file = path.join(outDir, packed.filename);
  const bytes = fs.readFileSync(file);
  return {
    name: packed.name,
    version: packed.version,
    file,
    integrity: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}`,
    shasum: crypto.createHash('sha1').update(bytes).digest('hex'),
    manifest: JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')),
  };
}

/**
 * Starts the registry for one packed package in this process. `log`, if set,
 * is a file that gets one line per request.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startLocalRegistry(pkg, { log } = {}) {
  const tarballPath = `/-/local/${path.basename(pkg.file)}`;
  let base = '';

  const packument = () => {
    const m = pkg.manifest;
    const version = {
      name: pkg.name,
      version: pkg.version,
      ...(m.description ? { description: m.description } : {}),
      ...(m.type ? { type: m.type } : {}),
      ...(m.bin ? { bin: m.bin } : {}),
      ...(m.exports ? { exports: m.exports } : {}),
      ...(m.engines ? { engines: m.engines } : {}),
      dependencies: m.dependencies ?? {},
      peerDependencies: m.peerDependencies ?? {},
      peerDependenciesMeta: m.peerDependenciesMeta ?? {},
      optionalDependencies: m.optionalDependencies ?? {},
      dist: { tarball: `${base}${tarballPath}`, integrity: pkg.integrity, shasum: pkg.shasum },
    };
    return {
      name: pkg.name,
      'dist-tags': { latest: pkg.version },
      versions: { [pkg.version]: version },
      modified: new Date().toISOString(),
    };
  };

  const server = http.createServer(async (req, res) => {
    if (log) {
      res.on('finish', () =>
        fs.appendFileSync(
          log,
          `${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode}\n`
        )
      );
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const name = decodeURIComponent(url.pathname.slice(1));
    try {
      if (req.method === 'GET' && name === pkg.name) {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(packument()));
        return;
      }
      if (req.method === 'GET' && url.pathname === tarballPath) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        fs.createReadStream(pkg.file).pipe(res);
        return;
      }
      // Everything else: proxy to the public registry.
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const headers = { ...req.headers };
      delete headers.host;
      delete headers['accept-encoding'];
      delete headers.connection;
      const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
        method: req.method,
        headers,
        ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
      });
      const out = Object.fromEntries(upstream.headers);
      delete out['content-encoding'];
      delete out['content-length'];
      delete out['transfer-encoding'];
      res.writeHead(upstream.status, out);
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } catch (error) {
      if (!res.headersSent) res.writeHead(502);
      res.end(String(error));
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    url: `${base}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Starts the registry in a child process, killed when this process exits.
 * @returns {Promise<{ url: string, close: () => void }>}
 */
export async function startRegistryProcess(pkg, { log } = {}) {
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), JSON.stringify({ pkg, log })],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
    }
  );
  const kill = () => child.kill();
  process.once('exit', kill);
  const url = await new Promise((resolve, reject) => {
    let buffered = '';
    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      const ready = /^READY (\S+)$/m.exec(buffered);
      if (ready) resolve(ready[1]);
    });
    child.once('exit', (code) => reject(new Error(`The local registry exited (${code})`)));
  });
  child.unref();
  child.stdout.unref?.();
  return {
    url,
    close: () => {
      process.off('exit', kill);
      kill();
    },
  };
}

// Child process entry: node local-registry.mjs '{"pkg":…,"log":…}'
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pkg, log } = JSON.parse(process.argv[2]);
  const registry = await startLocalRegistry(pkg, { log });
  console.log(`READY ${registry.url}`);
}
