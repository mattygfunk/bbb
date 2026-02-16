const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const PORT = Number(process.env.TEST_PORT || (4100 + Math.floor(Math.random() * 400)));
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
      env: { ...process.env, PORT: String(PORT), DATA_FILE, JWT_SECRET: 'test-secret-v5', TIP_EDIT_DEADLINE_ISO: '2099-12-31T23:59:59+11:00' },
      stdio: 'pipe'
    });

    let started = false;
    proc.stdout.on('data', (d) => {
      if (String(d).includes('V5 running')) started = true;
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
      body: JSON.stringify({ race: 'R9', selection: 'Night Tide' })
    }, userToken);
    assert.equal(res.status, 201);
    const tipId = res.body.tip.id;
    assert.equal(res.body.tip.status, 'approved');

    // Edit same race tip (upsert) before cutoff
    res = await api('/api/tips', {
      method: 'POST',
      body: JSON.stringify({ race: 'R9', selection: 'Ocean Star' })
    }, userToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.updated, true);
    assert.equal(res.body.tip.id, tipId);
    assert.equal(res.body.tip.selection, 'Ocean Star');

    res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    assert.equal(res.status, 200);
    const adminToken = res.body.token;

    res = await api('/api/tips?status=approved');
    assert.equal(res.status, 200);
    assert.ok(res.body.tips.some((t) => t.id === tipId && t.selection === 'Ocean Star'));

    // Non-admin cannot change fixtures
    res = await api('/api/fixtures/f1', {
      method: 'PUT',
      body: JSON.stringify({ date: 'Sun 16 Feb, 4:00 PM', event: 'Next Meet', track: 'Pinjarra' })
    }, userToken);
    assert.equal(res.status, 403);

    // Admin can change fixtures
    res = await api('/api/fixtures/f1', {
      method: 'PUT',
      body: JSON.stringify({ date: 'Sun 16 Feb, 4:00 PM', event: 'Next Meet', track: 'Pinjarra' })
    }, adminToken);
    assert.equal(res.status, 200);

    res = await api('/api/fixtures');
    assert.equal(res.status, 200);
    assert.equal(res.body.fixtures.find((f) => f.id === 'f1').date, 'Sun 16 Feb, 4:00 PM');

    proc.kill('SIGTERM');
    console.log('V5 integration tests passed ✅');
    process.exit(0);
  } catch (err) {
    console.error('V5 integration tests failed ❌');
    console.error(err);
    process.exit(1);
  }
})();
