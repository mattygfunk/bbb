(() => {
  const tokenKey = 'bbb-token-v3';
  const token = localStorage.getItem(tokenKey) || '';
  const state = { users: [], prizes: [], sessions: [], spins: [], activeSessionId: '' };
  const $ = (id) => document.getElementById(id);

  async function req(path, opt = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(`/api${path}`, { ...opt, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  }

  function entrantsFromTextarea() {
    const raw = String($('wheel-entrants')?.value || '');
    const out = Array.from(new Set(raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)));
    return out;
  }

  function activeSession() {
    return state.sessions.find((s) => String(s.id) === String(state.activeSessionId)) || null;
  }

  function render() {
    const prizeSel = $('wheel-prize');
    if (prizeSel) {
      prizeSel.innerHTML = state.prizes.filter((p) => p.active !== false).map((p) => `<option value="${p.id}">${p.title}</option>`).join('');
    }

    const userList = $('wheel-users-datalist');
    if (userList) userList.innerHTML = state.users.map((u)=>`<option value="${u}"></option>`).join('');

    const sessionsBody = $('wheel-sessions');
    if (sessionsBody) {
      sessionsBody.innerHTML = '';
      state.sessions.slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0)).forEach((s) => {
        const prize = state.prizes.find((p) => String(p.id) === String(s.prizeId));
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${s.title}</td><td>${s.status}</td><td>${(s.entrantsSnapshot||[]).length}</td><td>${prize?.title || '-'}</td><td><button class='btn btn-ghost' data-open='${s.id}'>Open</button></td>`;
        sessionsBody.appendChild(tr);
      });
      sessionsBody.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
        state.activeSessionId = String(btn.getAttribute('data-open') || '');
        const s = activeSession();
        if (!s) return;
        $('wheel-title').value = s.title || '';
        $('wheel-entrants').value = (s.entrantsSnapshot || []).join('\n');
        $('wheel-prize').value = s.prizeId || '';
      }));
    }

    const spinsBody = $('wheel-spins');
    if (spinsBody) {
      spinsBody.innerHTML = '';
      state.spins.slice(0, 30).forEach((sp) => {
        const s = state.sessions.find((x) => String(x.id) === String(sp.wheelSessionId));
        const pz = state.prizes.find((p) => String(p.id) === String(sp.prizeId));
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(Number(sp.spunAt||0)).toLocaleString('en-AU')}</td><td>${s?.title || sp.wheelSessionId}</td><td>${sp.winnerUsername}</td><td>${pz?.title || '-'}</td><td>${sp.spunByAdminUserId || '-'}</td><td><code>${String(sp.serverSeedHash || '').slice(0,16)}…</code></td>`;
        spinsBody.appendChild(tr);
      });
    }
  }

  async function load() {
    const d = await req('/admin/wheel/bootstrap');
    state.users = d.users || [];
    state.prizes = d.prizes || [];
    state.sessions = d.sessions || [];
    state.spins = d.spins || [];
    if (!state.activeSessionId && state.sessions[0]) state.activeSessionId = state.sessions[0].id;
    render();
  }

  async function createOrUpdate(status) {
    const msg = $('wheel-admin-msg');
    const title = String($('wheel-title')?.value || '').trim();
    const entrants = entrantsFromTextarea();
    const prizeId = String($('wheel-prize')?.value || '').trim();
    if (entrants.length < 2) throw new Error('Need at least 2 entrants');

    const existing = activeSession();
    if (!existing) {
      const out = await req('/admin/wheel/sessions', { method: 'POST', body: JSON.stringify({ title, entrants, prizeId, status }) });
      state.activeSessionId = out.session?.id || '';
      msg.textContent = `Created session: ${out.session?.title}`;
    } else {
      const out = await req(`/admin/wheel/sessions/${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify({ title, entrants, prizeId, status }) });
      msg.textContent = `Updated session: ${out.session?.title}`;
    }
    await load();
  }

  async function spin() {
    const s = activeSession();
    if (!s) throw new Error('Select or create a session first');
    const msg = $('wheel-admin-msg');
    const nonce = crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const out = await req(`/admin/wheel/sessions/${encodeURIComponent(s.id)}/spin`, { method: 'POST', body: JSON.stringify({ clientNonce: nonce }) });
    msg.textContent = `Winner: ${out.winnerUsername}`;
    await load();
  }

  async function resetSession() {
    const s = activeSession();
    if (!s) throw new Error('Select a session first');
    await req(`/admin/wheel/sessions/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: JSON.stringify({ reset: true, status: 'READY' }) });
    $('wheel-admin-msg').textContent = 'Session reset. Can spin again.';
    await load();
  }


  function appendEntrant(name) {
    const cleaned = String(name || '').trim();
    if (!cleaned) return;
    const current = entrantsFromTextarea();
    if (current.includes(cleaned)) return;
    current.push(cleaned);
    $('wheel-entrants').value = current.join('\n');
  }

  function dedupeEntrants() {
    const uniq = entrantsFromTextarea();
    $('wheel-entrants').value = uniq.join('\n');
  }

  function exportAuditCsv() {
    const rows = [['spunAt','sessionTitle','winner','prize','spunBy','serverSeedHash','serverSeedRevealed','winnerIndex','entrantsHash']];
    state.spins.forEach((sp) => {
      const s = state.sessions.find((x) => String(x.id) === String(sp.wheelSessionId));
      const pz = state.prizes.find((p) => String(p.id) === String(sp.prizeId));
      rows.push([
        new Date(Number(sp.spunAt||0)).toISOString(),
        String(s?.title || ''),
        String(sp.winnerUsername || ''),
        String(pz?.title || ''),
        String(sp.spunByAdminUserId || ''),
        String(sp.serverSeedHash || ''),
        String(sp.serverSeedRevealed || ''),
        String(sp.winnerIndex ?? ''),
        String(sp.entrantsHash || '')
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wheel-audit-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  $('wheel-save-draft')?.addEventListener('click', () => createOrUpdate('DRAFT').catch((e)=>{ $('wheel-admin-msg').textContent=e.message; }));
  $('wheel-mark-ready')?.addEventListener('click', () => createOrUpdate('READY').catch((e)=>{ $('wheel-admin-msg').textContent=e.message; }));
  $('wheel-spin')?.addEventListener('click', () => spin().catch((e)=>{ $('wheel-admin-msg').textContent=e.message; }));
  $('wheel-reset')?.addEventListener('click', () => resetSession().catch((e)=>{ $('wheel-admin-msg').textContent=e.message; }));
  $('wheel-add-user')?.addEventListener('click', () => { appendEntrant($('wheel-user-search')?.value || ''); if ($('wheel-user-search')) $('wheel-user-search').value = ''; });
  $('wheel-dedupe')?.addEventListener('click', () => dedupeEntrants());
  $('wheel-export-audit')?.addEventListener('click', () => exportAuditCsv());

  load().catch((e) => { $('wheel-admin-msg').textContent = e.message || 'Could not load wheel admin'; });
})();