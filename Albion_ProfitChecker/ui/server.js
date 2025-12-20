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

  // static files
  let file = 'index.html';
  let contentType = 'text/html';
  if (req.url.startsWith('/results.js')) {
    file = 'results.js';
    contentType = 'application/javascript';
  } else if (req.url.startsWith('/index.html')) {
    file = 'index.html';
  }

  sendFile(res, path.join(uiDir, file), contentType);
});

server.listen(port, () => {
  console.log(`UI server läuft auf http://localhost:${port}`);
});
