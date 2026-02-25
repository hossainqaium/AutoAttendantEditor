'use strict';

const { Client: SshClient } = require('ssh2');

function parseSshTarget() {
  const raw = process.env.FUSIONPBX_SSH || '';
  const at = raw.lastIndexOf('@');
  if (at === -1) return null;
  return {
    host: raw.slice(at + 1),
    username: raw.slice(0, at),
    password: process.env.FUSIONPBX_SSH_PASSWORD || '',
    port: parseInt(process.env.FUSIONPBX_SSH_PORT || '22'),
  };
}

function sshExec(cfg, cmd, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let settled = false;
    let timer;

    const finish = (code, stderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      resolve({ code, stderr: (stderr || '').trim() });
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      conn.end();
      reject(err);
    };

    conn.on('ready', () => {
      conn.exec(cmd, (err, stream) => {
        if (err) return fail(err);
        let stderr = '';
        stream.on('data', () => {});
        stream.stderr.on('data', (d) => { stderr += d; });
        stream.on('close', (code) => finish(code ?? 1, stderr));
        stream.on('error', fail);
        timer = setTimeout(() => fail(new Error(`SSH timeout ${timeoutMs / 1000}s`)), timeoutMs);
      });
    });
    conn.on('error', fail);
    conn.connect({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      readyTimeout: 8000,
    });
  });
}

module.exports = { parseSshTarget, sshExec };
