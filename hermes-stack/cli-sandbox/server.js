const os = require('os');
const pty = require('node-pty');
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8080;
const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const command = parsedUrl.query.cmd || 'bash';

  console.log(`[PTY Bridge] New connection, spawning: ${command}`);

  // Determine shell/command
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  let args = [];
  
  if (command !== 'bash') {
    args = ['-c', command];
  }

  // Spawn the PTY
  const ptyProcess = pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  });

  // Forward PTY output to WebSocket
  ptyProcess.onData((data) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    } catch (e) {
      console.error('Error sending data to ws:', e);
    }
  });

  // Forward WebSocket input to PTY
  ws.on('message', (msg) => {
    try {
      ptyProcess.write(msg.toString());
    } catch (e) {
      console.error('Error writing to pty:', e);
    }
  });

  // Handle cleanup
  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[PTY Bridge] Process exited with code ${exitCode}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  ws.on('close', () => {
    console.log('[PTY Bridge] WebSocket connection closed, killing PTY');
    try {
      ptyProcess.kill();
    } catch (e) {
      // ignore
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[PTY Bridge] Server listening on port ${PORT}`);
});
