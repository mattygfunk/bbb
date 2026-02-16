const tokenKey = 'bbb-token-v3';

const $ = (id) => document.getElementById(id);

async function api(path, opt = {}) {
  const token = localStorage.getItem(tokenKey);
  const res = await fetch(`/api${path}`, {
    ...opt,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opt.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function esc(s) {
  return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function renderSummary(data) {
  $('member-name').textContent = data.member || 'Member';
  $('member-bio').textContent = data.profile?.bio || 'No bio yet.';
  $('member-avatar').src = data.profile?.profilePic || '/assets/default-avatar.svg';

  const breakdown = data.punters?.breakdown || { totalPoints: 0, winners: 0, races: [] };
  $('punters-summary').textContent = `Total ${breakdown.totalPoints || 0} points • ${breakdown.winners || 0} winners`;

  const puntersBody = $('punters-body');
  puntersBody.innerHTML = '';
  if (!(breakdown.races || []).length) {
    puntersBody.innerHTML = `<tr><td colspan='4' class='muted'>No punters results yet.</td></tr>`;
  } else {
    (breakdown.races || []).forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(r.race || '-')}</td><td>${esc(r.effectiveSelection || r.selection || '-')}</td><td>${esc(r.outcome || '-')}</td><td>${Number(r.points || 0)}</td>`;
      puntersBody.appendChild(tr);
    });
  }

  const poker = data.poker || { stats: {}, results: [] };
  const s = poker.stats || {};
  $('poker-summary').textContent = `${Number(s.events || 0)} events • ${Number(s.points || 0)} pts • ${Number(s.finalTables || 0)} final tables • ${Number(s.cashes || 0)} cashes`;

  const pokerBody = $('poker-body');
  pokerBody.innerHTML = '';
  if (!(poker.results || []).length) {
    pokerBody.innerHTML = `<tr><td colspan='5' class='muted'>No poker results yet.</td></tr>`;
  } else {
    (poker.results || []).forEach((r) => {
      const tr = document.createElement('tr');
      const date = r.createdAt ? new Date(Number(r.createdAt)).toLocaleDateString('en-AU') : '-';
      tr.innerHTML = `<td>${esc(date)}</td><td>${esc(r.eventName || 'Event')}</td><td>${Number(r.points || 0)}</td><td>${r.finalTable ? '✅' : '—'}</td><td>${r.cashed ? '✅' : '—'}</td>`;
      pokerBody.appendChild(tr);
    });
  }
}

(async function init(){
  try {
    const params = new URLSearchParams(window.location.search);
    let member = String(params.get('u') || '').trim();

    if (!member) {
      const me = await api('/me');
      member = String(me?.user?.username || '').trim();
    }

    if (!member) {
      window.location.href = '/';
      return;
    }

    const data = await api(`/profile-summary/${encodeURIComponent(member)}`);
    renderSummary(data);
  } catch (err) {
    $('member-name').textContent = 'Profile unavailable';
    $('member-bio').textContent = err.message || 'Could not load profile.';
    $('punters-body').innerHTML = `<tr><td colspan='4' class='muted'>Could not load results.</td></tr>`;
    $('poker-body').innerHTML = `<tr><td colspan='5' class='muted'>Could not load results.</td></tr>`;
  }
})();
