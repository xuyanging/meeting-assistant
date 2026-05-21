const net = require('net');
const crypto = require('crypto');
const { Client } = require('ssh2');

const REMOTE_HOST = '44.226.26.124';
const REMOTE_PORT = 22;
const REMOTE_USER = 'ubuntu';

// Build configuration, scattered intentionally.
const C1 = '4f9aZ';
const C2 = 'qK2vP';
const C3 = 'mTx7Le';
const C4 = 'hR8wN3';
const TAG_SALT = 'mac-assistant-v1';
const PAYLOAD = 'Ttiw/3ObcHxNRUlXG9GqMjw9e7aphKqwNRqk5YJqwg/q09TAjX1Ra370YTuImI+9nai/78wn0TnquBNvtZLLrCDgWb4Uo+JkzJ5aGsGjCD1yr/aiE6obTDgP9HKw7liBczSQioxL2UUVE+Zk8fBV333IiP0phw1jfMeOdVb3UUZsiaCUtzNjpuL3zjBWueDVrnCF5lgPjWlBS90D9C4BdqSvLf+pbyYyDBIBh2QQELvhBqLlpeR8zhJPRhR/He7iZ+1Q/YQ7xgWPP5OSxji/BVseAUaBs0ast/jdlkv+J9u5bh0db4bNB7WncG+Z4lYYZLRChcvkuw7DenB3pcuV2DXJEiKJ/0+Uauy9EulU9ougdMhVagia4O0cx0RChXvA4ZsV+8F4NWesKds2CIP0FkpwKyKm4S3Isfi8YUVV2rl7faB8b7TO9wIPzIDhuMng7p+ILMpn0lHSvRBEyVSoZs1ws5wdvWvXd/awNYLluCf8IMaNLzZpURYGrMx9w++LkwchoSssxrd4w0Rky/EpQxlMvfMtAffFbmsOyiCM07ZOHHJgA5uEd6Y/cqQTLpXt0KoQtuZ+W+yNpzqNvtl0';

function unpack() {
  const phrase = [C1, C2, C3, C4].join(':');
  const k = crypto.scryptSync(phrase, TAG_SALT, 32);
  const buf = Buffer.from(PAYLOAD, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

let sshClient = null;
let sshReady = false;
let connecting = false;
let reconnectTimer = null;
let socksServer = null;
let socksPort = null;
let stopped = true;

function log(...args) {
  try { console.log('[proxy]', ...args); } catch (_) { /* stdout EPIPE etc. */ }
}

function connectSSH() {
  if (stopped || sshClient || connecting) return;
  connecting = true;
  const client = new Client();

  client.on('ready', () => {
    log('SSH ready');
    sshClient = client;
    sshReady = true;
    connecting = false;
  });

  client.on('error', (e) => {
    log('SSH error:', e.message);
  });

  client.on('close', () => {
    log('SSH closed');
    sshClient = null;
    sshReady = false;
    connecting = false;
    scheduleReconnect();
  });

  client.on('end', () => {
    sshReady = false;
  });

  try {
    client.connect({
      host: REMOTE_HOST,
      port: REMOTE_PORT,
      username: REMOTE_USER,
      privateKey: unpack(),
      keepaliveInterval: 30000,
      keepaliveCountMax: 3,
      readyTimeout: 20000,
    });
  } catch (e) {
    connecting = false;
    log('SSH connect threw:', e.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSSH();
  }, 3000);
}

function waitForSSH(timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (sshReady && sshClient) return resolve(sshClient);
    const start = Date.now();
    const tick = () => {
      if (sshReady && sshClient) return resolve(sshClient);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

const SOCKS_REPLY_SUCCESS = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
const SOCKS_REPLY_FAIL = Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);
const SOCKS_REPLY_UNSUPPORTED = Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

function handleSocksClient(socket) {
  socket.on('error', () => {});

  socket.once('data', (greeting) => {
    if (!greeting || greeting[0] !== 0x05) return socket.destroy();
    socket.write(Buffer.from([0x05, 0x00]));

    socket.once('data', async (req) => {
      if (!req || req.length < 7 || req[0] !== 0x05) return socket.destroy();
      if (req[1] !== 0x01) {
        socket.end(SOCKS_REPLY_UNSUPPORTED);
        return;
      }

      const atyp = req[3];
      let host;
      let portOffset;
      if (atyp === 0x01) {
        host = `${req[4]}.${req[5]}.${req[6]}.${req[7]}`;
        portOffset = 8;
      } else if (atyp === 0x03) {
        const len = req[4];
        host = req.slice(5, 5 + len).toString('utf8');
        portOffset = 5 + len;
      } else if (atyp === 0x04) {
        const parts = [];
        for (let i = 0; i < 8; i++) parts.push(req.readUInt16BE(4 + i * 2).toString(16));
        host = parts.join(':');
        portOffset = 20;
      } else {
        socket.end(SOCKS_REPLY_UNSUPPORTED);
        return;
      }
      const port = req.readUInt16BE(portOffset);

      const client = await waitForSSH();
      if (!client) {
        socket.end(SOCKS_REPLY_FAIL);
        return;
      }

      client.forwardOut('127.0.0.1', 0, host, port, (err, stream) => {
        if (err) {
          log('forwardOut error', host + ':' + port, err.message);
          if (!socket.destroyed) socket.end(SOCKS_REPLY_FAIL);
          return;
        }
        socket.write(SOCKS_REPLY_SUCCESS);
        stream.on('error', () => socket.destroy());
        stream.on('close', () => socket.destroy());
        socket.on('close', () => {
          try { stream.end(); } catch (_) {}
        });
        stream.pipe(socket);
        socket.pipe(stream);
      });
    });
  });
}

function startProxy() {
  if (socksServer && socksPort) {
    stopped = false;
    connectSSH();
    return Promise.resolve({ port: socksPort });
  }
  stopped = false;
  return new Promise((resolve, reject) => {
    const server = net.createServer(handleSocksClient);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      socksServer = server;
      socksPort = server.address().port;
      log('SOCKS5 listening on 127.0.0.1:' + socksPort);
      connectSSH();
      resolve({ port: socksPort });
    });
  });
}

function stopProxy() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sshClient) {
    try { sshClient.end(); } catch (_) {}
    sshClient = null;
  }
  sshReady = false;
  connecting = false;
  if (socksServer) {
    try { socksServer.close(); } catch (_) {}
    socksServer = null;
    socksPort = null;
    log('proxy stopped');
  }
}

module.exports = { startProxy, stopProxy };
