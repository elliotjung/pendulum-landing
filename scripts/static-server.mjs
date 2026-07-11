import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const host = '127.0.0.1';
const port = Number.parseInt(process.argv[2] ?? process.env.PORT ?? '4177', 10);

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
]);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const candidate = resolve(join(root, normalize(requested)));
  const rel = relative(root, candidate);

  if (rel.startsWith('..') || rel === '' || rel.includes('..\\')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const info = await stat(candidate);
    if (!info.isFile()) throw new Error('not a file');
    const type = mimeTypes.get(extname(candidate)) ?? 'application/octet-stream';
    // GitHub Pages (production) serves text assets gzip-compressed; mirror
    // that here so local Lighthouse runs measure production-like transfer
    // sizes instead of penalizing readable (unminified) source files.
    const compressible = /^(text\/|application\/json|image\/svg)/.test(type);
    const acceptsGzip = /\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''));
    if (compressible && acceptsGzip) {
      response.writeHead(200, {
        'Content-Type': type,
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
        'Cache-Control': 'no-store',
      });
      createReadStream(candidate).pipe(createGzip({ level: 6 })).pipe(response);
      return;
    }
    response.writeHead(200, {
      'Content-Length': info.size,
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Serving HTTP on ${host}:${port}`);
});
