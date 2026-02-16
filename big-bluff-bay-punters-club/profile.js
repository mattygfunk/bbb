const tokenKey = 'bbb-token-v3';

const $ = (id) => document.getElementById(id);
let currentMember = '';
let currentUser = null;

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
  $('hl-punters-points').textContent = String(Number(breakdown.totalPoints || 0));
  $('hl-punters-winners').textContent = String(Number(breakdown.winners || 0));

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
  $('hl-poker-points').textContent = String(Number(s.points || 0));
  $('hl-poker-events').textContent = String(Number(s.events || 0));

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

function wireSettingsForm(profile, canEdit) {
  const form = $('profile-form');
  if (!form) return;
  const msg = $('profile-msg');
  const picInput = $('profile-pic-input');
  const picFile = $('profile-pic-file');
  const bioInput = $('profile-bio-input');
  const publicInput = $('profile-public-input');
  const emailInput = $('profile-email-input');
  const themeInput = $('profile-theme-input');
  const preview = $('profile-pic-preview');

  if (picInput) picInput.value = profile?.profilePic || '';
  if (bioInput) bioInput.value = profile?.bio || '';
  if (publicInput) publicInput.checked = Boolean(profile?.settings?.publicProfile);
  if (emailInput) emailInput.checked = Boolean(profile?.settings?.emailNotifications);
  if (themeInput) themeInput.value = profile?.settings?.theme || 'system';
  if (preview) preview.src = profile?.profilePic || '/assets/default-avatar.svg';

  form.querySelectorAll('input, textarea, select, button').forEach((el) => { el.disabled = !canEdit; });
  if (msg) msg.textContent = canEdit ? 'Update your profile settings here.' : 'Only available on your own profile.';

  if (!canEdit) return;

  form.addEventListener('input', (e) => {
    if (e.target?.id === 'profile-pic-input' && preview) {
      preview.src = e.target.value.trim() || '/assets/default-avatar.svg';
    }
  });

  form.addEventListener('change', (e) => {
    if (e.target?.id !== 'profile-pic-file') return;
    const file = picFile?.files?.[0];
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      if (msg) msg.textContent = 'Please upload an image file.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (picInput) picInput.value = dataUrl;
        if (preview) preview.src = dataUrl;
        if (msg) msg.textContent = 'Avatar ready. Click Save Profile.';
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      bio: String(fd.get('bio') || '').trim(),
      profilePic: String(fd.get('profilePic') || '').trim(),
      settings: {
        publicProfile: fd.get('publicProfile') === 'on',
        emailNotifications: fd.get('emailNotifications') === 'on',
        theme: String(fd.get('theme') || 'system')
      }
    };
    try {
      const res = await api('/profile', { method: 'PUT', body: JSON.stringify(payload) });
      wireSettingsForm(res.profile || payload, true);
      $('member-bio').textContent = res.profile?.bio || 'No bio yet.';
      $('member-avatar').src = res.profile?.profilePic || '/assets/default-avatar.svg';
      if (msg) msg.textContent = 'Profile saved.';
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Could not save profile.';
    }
  });
}

(async function init(){
  try {
    const params = new URLSearchParams(window.location.search);
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const pathMember = pathParts[0] === 'profile' && pathParts[1] ? decodeURIComponent(pathParts[1]) : '';
    currentMember = String(pathMember || params.get('u') || '').trim();

    try {
      const me = await api('/me');
      currentUser = me?.user || null;
    } catch {
      currentUser = null;
    }

    if (!currentMember && currentUser?.username) {
      currentMember = String(currentUser.username).trim();
    }

    if (!currentMember) {
      window.location.href = '/';
      return;
    }

    const data = await api(`/profile-summary/${encodeURIComponent(currentMember)}`);
    renderSummary(data);

    const canEdit = Boolean(currentUser?.username) && String(currentUser.username).toLowerCase() === String(data?.member || currentMember).toLowerCase();
    wireSettingsForm(data.profile || {}, canEdit);

    const canonicalMemberUrl = `/profile/${encodeURIComponent(String(data?.member || currentMember || '').trim())}`;
    if (window.location.pathname !== canonicalMemberUrl) {
      window.history.replaceState({}, '', canonicalMemberUrl + window.location.hash);
    }
    const canonicalEl = document.getElementById('canonical-profile-link');
    if (canonicalEl) canonicalEl.setAttribute('href', `https://bigbluffbay.au${canonicalMemberUrl}`);
  } catch (err) {
    $('member-name').textContent = 'Profile unavailable';
    $('member-bio').textContent = err.message || 'Could not load profile.';
    $('punters-body').innerHTML = `<tr><td colspan='4' class='muted'>Could not load results.</td></tr>`;
    $('poker-body').innerHTML = `<tr><td colspan='5' class='muted'>Could not load results.</td></tr>`;
  }
})();
