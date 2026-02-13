const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = 3188;
const BASE = `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'data', 'test-store.json');

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function api(url, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${url}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

(async () => {
  try {
    if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);

    const proc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DATA_FILE, JWT_SECRET: 'test-secret-v4' },
      stdio: 'pipe'
    });

    let started = false;
    proc.stdout.on('data', (d) => {
      if (String(d).includes('V4 running')) started = true;
    });

    for (let i = 0; i < 40 && !started; i += 1) await wait(100);
    if (!started) throw new Error('Server did not start in time');

    let res = await api('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    res = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username: 'matt', password: 'secret123' })
    });
    assert.equal(res.status, 201);

    res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'matt', password: 'secret123' })
    });
    assert.equal(res.status, 200);
    const userToken = res.body.token;

    res = await api('/api/tips', {
      method: 'POST',
      body: JSON.stringify({ race: 'R9', horse: 'Night Tide', odds: '$8.50', reason: 'Late market support.' })
    }, userToken);
    assert.equal(res.status, 201);
    const pendingId = res.body.tip.id;
    assert.equal(res.body.tip.status, 'pending');

    res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(res.status, 200);
    const adminToken = res.body.token;

    res = await api(`/api/tips/${pendingId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    }, adminToken);
    assert.equal(res.status, 200);

    res = await api('/api/tips?status=approved');
    assert.equal(res.status, 200);
    assert.ok(res.body.tips.some((t) => t.id === pendingId));

    proc.kill('SIGTERM');
    console.log('V4 integration tests passed ✅');
    process.exit(0);
  } catch (err) {
    console.error('V4 integration tests failed ❌');
    console.error(err);
    process.exit(1);
  }
})();
