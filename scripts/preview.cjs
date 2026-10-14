// Aperçu local des pages statiques. Les API PHP nécessitent un serveur PHP et config/.env.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  // Local-only visual preview: synthetic data, no Supabase client or session.
  if (['GET', 'HEAD'].includes(req.method) && ['/__preview/dashboard', '/__preview/dashboard.js'].includes(pathname)) {
    const isPage = pathname === '/__preview/dashboard';
    const target = path.join(root, isPage ? 'admin/dashboard.html' : 'scripts/dashboard-preview.js');
    fs.readFile(target, 'utf8', (error, source) => {
      if (error) { res.writeHead(404).end('Not found'); return; }
      if (isPage) {
        source = source.replace(/\s*<meta name="supabase-(?:url|key)"[^>]*>/g, '')
          .replace('<head>', '<head><base href="/admin/">')
          .replace('src="js/dashboard.js"', 'src="/__preview/dashboard.js"')
          .replace('<main class="main-content" id="mainContent" tabindex="-1">', '<main class="main-content" id="mainContent" tabindex="-1"><div class="preview-banner"><strong>Aperçu · Données fictives</strong><a href="/admin/dashboard.html">Ouvrir mon espace réel →</a></div>');
      }
      res.writeHead(200, { 'Content-Type': isPage ? types['.html'] : types['.js'], 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : source);
    });
    return;
  }
  const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  const relative = path.relative(root, file);
  const type = types[path.extname(file)];
  if (!['GET', 'HEAD'].includes(req.method) || !type || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.') || ['node_modules', 'api', 'config', 'vendor', 'scripts'].includes(part))) {
    res.writeHead(404).end('Not found'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
