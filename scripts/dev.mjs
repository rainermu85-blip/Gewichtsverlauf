import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/Gewichtsverlauf') { response.writeHead(302, { Location: '/Gewichtsverlauf/' }).end(); return; }
    pathname = pathname.replace(/^\/Gewichtsverlauf\//, '/');
    const filename = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!filename.startsWith(root)) { response.writeHead(404).end(); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
  } catch { response.writeHead(404).end('Nicht gefunden.'); }
}).listen(4173, '0.0.0.0', () => console.log('Gewichtsverlauf: http://localhost:4173/Gewichtsverlauf/'));
