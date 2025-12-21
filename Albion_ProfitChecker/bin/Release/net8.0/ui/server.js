const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const uiDir = __dirname;
const projectDir = path.resolve(__dirname, '..');
const port = 5173;

function sendFile(res, filePath, contentType = 'text/html') {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'POST' && req.url === '/refresh') {
    const cmd = 'dotnet run -- --profit-min 0 --sold-min 0 --bm-days 14';
    const start = Date.now();
    exec(cmd, { cwd: projectDir }, (err, stdout, stderr) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message, stdout, stderr }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ updatedAt: new Date().toISOString(), durationMs: Date.now() - start }));
    });
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/progress')) {
    const progressPath = path.join(projectDir, 'ui', 'progress.json');
    fs.readFile(progressPath, (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ total: 0, done: 0, ts: new Date().toISOString() }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    });
    return;
  }

  // static files / routing
  let filePath = path.join(uiDir, 'index.html');
  let contentType = 'text/html';

  if (url.pathname === '/dashboard' || url.pathname === '/dashboard.html') {
    filePath = path.join(uiDir, 'dashboard.html');
  } else if (url.pathname === '/index.html' || url.pathname === '/') {
    filePath = path.join(uiDir, 'index.html');
  } else if (url.pathname === '/styles.css') {
    filePath = path.join(uiDir, 'styles.css');
    contentType = 'text/css';
  } else if (url.pathname.startsWith('/results.js')) {
    filePath = path.join(uiDir, 'results.js');
    contentType = 'application/javascript';
  } else if (url.pathname === '/progress.json') {
    filePath = path.join(uiDir, 'progress.json');
    contentType = 'application/json';
  } else if (url.pathname.startsWith('/picture/')) {
    const imgPath = path.join(projectDir, url.pathname);
    filePath = imgPath;
    const ext = path.extname(imgPath).toLowerCase();
    const map = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
    contentType = map[ext] || 'application/octet-stream';
  }

  sendFile(res, filePath, contentType);
});

server.listen(port, () => {
  console.log(`UI server läuft auf http://localhost:${port}`);
});
