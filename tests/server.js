/**
 * server.js — Servidor HTTP estático mínimo para pruebas (Node puro, sin dependencias).
 *
 * Uso como módulo:
 *   const { createTestServer } = require('./server.js');
 *   const server = createTestServer(raizDelProyecto);
 *
 * Uso como CLI (para servir la app localmente):
 *   node tests/server.js [raíz]   (o npm run serve; puerto vía env PORT, por defecto 8080)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function createTestServer(rootDir) {
  const root = path.resolve(rootDir);
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (error) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }
    const filePath = path.resolve(path.join(root, pathname));
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
  const port = Number(process.env.PORT || 8080);
  const server = createTestServer(root);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Sirviendo ${root} en http://127.0.0.1:${port}`);
  });
}

module.exports = { createTestServer };