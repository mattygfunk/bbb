const API_ROOTS=['/api'];
const API={tips:'/tips',fixtures:'/fixtures',results:'/results',raceRunners:'/race-runners',raceRunnersParse:'/race-runners/parse',bossesBet:'/bosses-bet',bossesBetResults:'/bosses-bet/results',archiveRound:'/archive-round',unlockSatNoon:'/tips/unlock-saturday-noon',tipEditDeadline:'/tips/edit-deadline',jackpot:'/jackpot',puntersClaims:'/punters/claims',puntersVerifyPayment:'/punters/payments/verify',puntersVerifyPayout:'/punters/payouts/verify',puntersRounds:'/punters/rounds',deleteRound:(id)=>`/punters/rounds/${encodeURIComponent(id)}`,publishWinner:(id)=>`/punters/rounds/${encodeURIComponent(id)}/publish-winner`,closeRound:(id)=>`/punters/rounds/${encodeURIComponent(id)}/close`,recomputeSnapshot:(id)=>`/punters/rounds/${encodeURIComponent(id)}/recompute-snapshot`,openNextRound:'/punters/rounds/open-next',puntersSettings:'/punters/settings',pokerResults:'/poker-results',pokerLeaderboard:'/poker-leaderboard',pokerPlayers:'/poker-players',pokerPlayersImport:'/poker-players/import',users:'/users',alertsMonitor:'/alerts/monitor',alertsTemplateTest:'/alerts/templates/test',userRole:(id)=>`/users/${id}/role`,userVerify:(id)=>`/users/${id}/verify`,login:'/login',logout:'/logout',me:'/me',updateFixture:id=>`/fixtures/${id}`,updateResult:race=>`/results/${race}`,clearResult:race=>`/results/${race}`,saveRaceRunners:race=>`/race-runners/${race}`,updateTip:(id)=>`/tips/${id}`};
const tokenKey='bbb-token-v3';
const trackKey='bbb-admin-track-v1';
const state={token:localStorage.getItem(tokenKey)||null,user:null,raceCount:12,fixtureId:'f1',raceResults:{},raceRunners:{},parsedRunners:[],bossesBet:{legs:['R9','R10','R11','R12'],selections:{},legItems:[],status:'live',title:'Bosses Multi',eligibilityNote:'Eligible = all players who entered tips this week before lock.',freerollPrize:0},bossesDraft:null,tipsAll:[],popularByRace:{},rolloverAppliedFromQuery:false,trackId:localStorage.getItem(trackKey)||'thoroughbreds',summary:{tipUsers:0,paidUsers:0,pokerEvents:0}};
const $=id=>document.getElementById(id);
async function req(path,opt={}){const h={'Content-Type':'application/json',...(opt.headers||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;let lastErr='';let lastStatus=0;let lastData={};for(const root of API_ROOTS){const r=await fetch(`${root}${path}`,{...opt,headers:h});const d=await r.json().catch(()=>({}));if(r.ok)return d;if(r.status===403){lastErr=d.error||'Admin only. Log in with an admin account (farmilut).';lastStatus=r.status;lastData=d;continue;}if(r.status===401){lastErr=d.error||'Session expired. Please log in again.';lastStatus=r.status;lastData=d;continue;}lastErr=d.error||`Request failed (${r.status})`;lastStatus=r.status;lastData=d;}const err=new Error(lastErr||'Request failed');err.status=lastStatus;err.data=lastData;throw err;}
function esc(s){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}

function ensureAlertsPreviewModal(){
  let modal = document.getElementById('alerts-template-preview-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'alerts-template-preview-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.75);z-index:9999;display:none;align-items:center;justify-content:center;padding:1rem;';
  modal.innerHTML = `
    <div style="width:min(980px,96vw);height:min(86vh,860px);background:#0b1220;border:1px solid #334155;border-radius:12px;display:grid;grid-template-rows:auto auto 1fr;overflow:hidden;box-shadow:0 18px 44px rgba(0,0,0,.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:.7rem .85rem;border-bottom:1px solid #233044;gap:.7rem">
        <strong id="alerts-template-preview-title">Template Preview</strong>
        <button type="button" class="btn btn-ghost" id="alerts-template-preview-close">Close</button>
      </div>
      <div id="alerts-template-preview-subject" style="padding:.55rem .85rem;border-bottom:1px solid #233044;color:#c7d6e4;background:#0e172a;font-size:.92rem"><strong style="color:#9fb3ce">Subject:</strong> —</div>
      <iframe id="alerts-template-preview-frame" title="Alert template HTML preview" style="width:100%;height:100%;border:0;background:#0b1219"></iframe>
    </div>`;
  document.body.appendChild(modal);

  const close = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  modal.querySelector('#alerts-template-preview-close')?.addEventListener('click', close);
  return modal;
}

function toastBosses(msg, tone='ok'){
  const el = $('bosses-msg');
  if(!el) return;
  el.textContent = msg;
  el.classList.remove('msg-ok','msg-err','msg-warn','admin-toast-pop');
  el.classList.add(tone==='err'?'msg-err':tone==='warn'?'msg-warn':'msg-ok');
  void el.offsetWidth;
  el.classList.add('admin-toast-pop');
}
function isAdmin(){return state.user?.role==='admin';}
function withTrack(path){
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}track=${encodeURIComponent(state.trackId || 'thoroughbreds')}`;
}

function updateTrackLabels(){
  const name = state.trackId === 'greyhounds' ? 'Greyhounds' : 'Thoroughbreds';
  const text = `${name} (${state.trackId})`;
  ['admin-active-track-pill','legacy-active-track','archive-active-track'].forEach((id)=>{
    const el = $(id);
    if (el) el.textContent = text;
  });
}

function setPokerResultMsg(type, text){
  const el = $('poker-result-msg');
  if (!el) return;
  el.textContent = String(text || '');
  el.classList.remove('msg-ok', 'msg-warn', 'msg-err');
  if (type === 'ok') el.classList.add('msg-ok');
  else if (type === 'warn') el.classList.add('msg-warn');
  else if (type === 'err') el.classList.add('msg-err');
}

function applyAdminViewFilter(){
  const params = new URLSearchParams(window.location.search || '');
  const view = String(params.get('view') || 'all').toLowerCase();
  const racing = $('admin-racing-sections');
  const poker = $('admin-poker-sections');
  const racingUsers = $('admin-racing-users');

  const showRacing = view === 'all' || view === 'racing';
  const showPoker = view === 'all' || view === 'poker';

  if (racing) racing.style.display = showRacing ? 'grid' : 'none';
  if (racingUsers) racingUsers.style.display = showRacing ? 'block' : 'none';
  if (poker) poker.style.display = showPoker ? 'grid' : 'none';

  document.querySelectorAll('.admin-mode-link').forEach((el) => {
    el.classList.toggle('active', String(el.dataset.adminView || 'all') === view);
  });

  const pill = $('admin-active-view-pill');
  if (pill) pill.textContent = `View: ${view}`;

  return view;
}

function renderAdminSummaryCounts(){
  const tipUsers = Number(state.summary?.tipUsers || 0);
  const paidUsers = Number(state.summary?.paidUsers || 0);
  const pokerEvents = Number(state.summary?.pokerEvents || 0);

  const racingCount = document.querySelectorAll('#admin-racing-sections > section.card').length;
  const pokerCount = document.querySelectorAll('#admin-poker-sections > section.card').length;
  const allCount = racingCount + pokerCount;

  const allEl = $('admin-count-all');
  const racingEl = $('admin-count-racing');
  const pokerEl = $('admin-count-poker');
  if (allEl) allEl.textContent = String(allCount);
  if (racingEl) racingEl.textContent = String(racingCount);
  if (pokerEl) pokerEl.textContent = String(pokerCount);

  const tipUsersEl = $('admin-stat-tip-users');
  const paidUsersEl = $('admin-stat-paid-users');
  const pokerEventsEl = $('admin-stat-poker-events');
  if (tipUsersEl) tipUsersEl.textContent = String(tipUsers);
  if (paidUsersEl) paidUsersEl.textContent = String(paidUsers);
  if (pokerEventsEl) pokerEventsEl.textContent = String(pokerEvents);
}

async function loadAdminUsers(){
  const body = $('admin-users-body');
  const msg = $('admin-users-msg');
  if (!body) return;
  if (!isAdmin()) {
    body.innerHTML = "<tr><td colspan='8' class='muted'>Admin login required.</td></tr>";
    return;
  }
  try {
    const out = await req(API.users);
    const users = out.users || [];
    body.innerHTML = '';
    users.forEach((u)=>{
      const tr = document.createElement('tr');
      const created = u.createdAt ? new Date(Number(u.createdAt)).toLocaleDateString('en-AU') : '-';
      const actionLabel = u.role === 'admin' ? 'Set Member' : 'Make Admin';
      const nextRole = u.role === 'admin' ? 'member' : 'admin';
      const withVerify = (value, ok, channel) => {
        const v = String(value || '-');
        const next = !Boolean(ok);
        const label = next ? 'Mark verified' : 'Unverify';
        return `${esc(v)} ${ok ? "<span title='Verified'>✅</span>" : "<span title='Not verified'>⚪</span>"} <button class='btn btn-ghost' style='padding:.18rem .4rem;min-height:auto' data-verify-user='${encodeURIComponent(String(u.id || ''))}' data-verify-channel='${channel}' data-verify-next='${next ? 'true' : 'false'}'>${label}</button>`;
      };
      tr.innerHTML = `<td>${esc(u.username || '-')}</td><td>${esc(u.role || 'member')}</td><td>${withVerify(u.email, u?.verified?.email, 'email')}</td><td>${withVerify(u.phone, u?.verified?.phone, 'phone')}</td><td>${withVerify(u.whatsapp, u?.verified?.whatsapp, 'whatsapp')}</td><td>${withVerify(u.telegram, u?.verified?.telegram, 'telegram')}</td><td>${esc(created)}</td><td><button class='btn btn-ghost' data-user-id='${encodeURIComponent(String(u.id || ''))}' data-next-role='${nextRole}'>${actionLabel}</button></td>`;
      body.appendChild(tr);
    });
    if (!users.length) body.innerHTML = "<tr><td colspan='8' class='muted'>No users found.</td></tr>";

    body.querySelectorAll('button[data-user-id]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        const id = decodeURIComponent(btn.dataset.userId || '');
        const role = String(btn.dataset.nextRole || 'member');
        try {
          await req(API.userRole(id), { method:'PATCH', body: JSON.stringify({ role }) });
          if (msg) msg.textContent = `Updated role to ${role}.`;
          await loadAdminUsers();
        } catch (err) {
          if (msg) msg.textContent = err.message || 'Could not update role.';
        }
      });
    });

    body.querySelectorAll('button[data-verify-user]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        const id = decodeURIComponent(btn.dataset.verifyUser || '');
        const channel = String(btn.dataset.verifyChannel || 'email');
        const verified = String(btn.dataset.verifyNext || 'false') === 'true';
        try {
          await req(API.userVerify(id), { method:'PATCH', body: JSON.stringify({ channel, verified }) });
          if (msg) msg.textContent = `${channel} ${verified ? 'marked verified' : 'set unverified'}.`;
          await loadAdminUsers();
        } catch (err) {
          if (msg) msg.textContent = err.message || 'Could not update verification.';
        }
      });
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan='8' class='muted'>${esc(err.message || 'Could not load users.')}</td></tr>`;
  }
}

let alertsMonitorCache = { subscribersRaw: [] };

async function loadAlertsMonitor(){
  const subsBody = $('alerts-mon-subs-body');
  const nextBody = $('alerts-mon-next-body');
  const templatesBody = $('alerts-mon-templates-body');
  const msg = $('alerts-mon-msg');
  const filterEl = $('alerts-mon-filter');
  const searchEl = $('alerts-mon-search');
  const sortEl = $('alerts-mon-sort');
  const testEmailEl = $('alerts-mon-test-email');
  const refreshBtn = $('alerts-mon-refresh');
  const exportBtn = $('alerts-mon-export');
  const historyBody = $('alerts-mon-history-body');
  if (!subsBody || !nextBody || !templatesBody) return;
  if (!isAdmin()) {
    subsBody.innerHTML = "<tr><td colspan='5' class='muted'>Admin login required.</td></tr>";
    nextBody.innerHTML = "<tr><td colspan='4' class='muted'>Admin login required.</td></tr>";
    templatesBody.innerHTML = "<tr><td colspan='5' class='muted'>Admin login required.</td></tr>";
    return;
  }

  try {
    const out = await req(API.alertsMonitor);
    const summary = out.summary || {};
    const subscribersRaw = out.subscribers || [];
    const nextAlerts = out.nextAlerts || [];
    const templates = out.templates || [];
    const history = out.history || [];

    const totalSubscribers = Number(summary.totalSubscribers || subscribersRaw.length || 0);
    const verifiedSubscribers = Number(summary.verifiedEmailSubscribers || 0);
    const nextCount = Number(nextAlerts.length || 0);
    const mobileCount = Number((summary.channels && summary.channels.phone) || subscribersRaw.filter((s) => String(s.phone || '').trim()).length || 0);
    const verifiedRate = totalSubscribers > 0 ? Math.round((verifiedSubscribers / totalSubscribers) * 100) : 0;

    $('alerts-mon-subs').textContent = String(totalSubscribers);
    $('alerts-mon-verified').textContent = String(verifiedSubscribers);
    $('alerts-mon-next-count').textContent = String(nextCount);
    if ($('alerts-mon-mobile-count')) $('alerts-mon-mobile-count').textContent = String(mobileCount);
    if ($('alerts-mon-verified-rate')) $('alerts-mon-verified-rate').textContent = `${verifiedRate}%`;

    const mode = String(filterEl?.value || 'all');
    const q = String(searchEl?.value || '').trim().toLowerCase();
    const sortBy = String(sortEl?.value || 'username-asc');
    alertsMonitorCache.subscribersRaw = subscribersRaw;
    const subscribers = subscribersRaw.filter((s) => {
      if (mode === 'verified' && !Boolean(s.verifiedEmail)) return false;
      if (mode === 'overlay' && !Boolean(s?.alerts?.overlayWatch)) return false;
      if (mode === 'no-mobile' && String(s.phone || '').trim()) return false;
      if (q) {
        const hay = `${String(s.username || '').toLowerCase()} ${String(s.email || '').toLowerCase()}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>{
      if (sortBy === 'username-desc') return String(b.username||'').localeCompare(String(a.username||''));
      if (sortBy === 'email-asc') return String(a.email||'').localeCompare(String(b.email||''));
      if (sortBy === 'verified-desc') return Number(Boolean(b.verifiedEmail)) - Number(Boolean(a.verifiedEmail)) || String(a.username||'').localeCompare(String(b.username||''));
      return String(a.username||'').localeCompare(String(b.username||''));
    });

    subsBody.innerHTML = '';
    const prettyAlertName = (k) => ({
      overlayWatch: 'overlay',
      lateReg: 'late-reg',
      startingSoon: 'starting-soon',
      freerolls: 'freeroll',
      cashActive: 'cash-active'
    }[k] || k);

    subscribers.forEach((s) => {
      const enabledList = Object.entries(s.alerts || {}).filter(([,v]) => v).map(([k]) => prettyAlertName(k));
      const enabled = enabledList.length ? enabledList.join(', ') : 'none';
      const enabledHtml = enabledList.length
        ? enabledList.map((name) => `<span class="pill" style="margin-right:.25rem">${esc(name)}</span>`).join('')
        : '<span class="muted">none</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(s.username || '-')}</td><td>${esc(s.email || '-')}</td><td>${s.verifiedEmail ? '<span class="pill" style="color:#86efac;border-color:#14532d;background:#052e16">✅ verified</span>' : '<span class="pill">⚪ pending</span>'}</td><td>${esc(s.phone || '-')}</td><td title="${esc(enabled)}">${enabledHtml}</td>`;
      subsBody.appendChild(tr);
    });
    if (!subscribers.length) subsBody.innerHTML = "<tr><td colspan='5' class='muted'>No matching subscribers.</td></tr>";

    nextBody.innerHTML = '';
    nextAlerts.forEach((a) => {
      const tr = document.createElement('tr');
      const when = a.sendAtIso ? new Date(a.sendAtIso).toLocaleString('en-AU') : '-';
      const mins = Number.isFinite(a.sendAt) ? Math.max(0, Math.round((Number(a.sendAt) - Date.now()) / 60000)) : null;
      const rel = mins == null ? '' : ` (${mins}m)`;
      tr.innerHTML = `<td>${esc(`${when}${rel}`)}</td><td>${esc(a.templateLabel || a.templateId || '-')}</td><td>${esc(a.eventTitle || '-')}</td><td>${esc(a.recipient || '-')}</td>`;
      tr.style.cursor = 'pointer';
      tr.title = 'Click to preview this outgoing email';
      tr.addEventListener('click', () => {
        const template = templates.find((t) => String(t.id || '') === String(a.templateId || ''));
        if (!template) {
          if (msg) msg.textContent = `No template found for ${String(a.templateLabel || a.templateId || 'this alert')}.`;
          return;
        }
        const email = String(a.recipient || 'member@bigbluffbay.au');
        const recipientName = email.includes('@') ? email.split('@')[0] : email;
        const vars = {
          eventTitle: String(a.eventTitle || 'Nightly Prime'),
          recipientName,
          startTime: when,
          recipientEmail: email
        };
        let html = String(template.html || '');
        Object.entries(vars).forEach(([k, v]) => { html = html.replaceAll(`{${k}}`, String(v)); });

        const modal = ensureAlertsPreviewModal();
        const frame = modal.querySelector('#alerts-template-preview-frame');
        const title = modal.querySelector('#alerts-template-preview-title');
        const subjectEl = modal.querySelector('#alerts-template-preview-subject');
        let subject = String(template.subject || '');
        Object.entries(vars).forEach(([k, v]) => { subject = subject.replaceAll(`{${k}}`, String(v)); });
        if (title) title.textContent = `Queue Preview • ${String(a.templateLabel || template.name || a.templateId || 'Alert')} → ${email}`;
        if (subjectEl) subjectEl.innerHTML = `<strong style="color:#9fb3ce">Subject:</strong> ${esc(subject || '-')}`;
        if (frame) frame.srcdoc = `<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>Queued Alert Preview</title></head><body style='margin:0;background:#0b1219;'>${html}</body></html>`;
        modal.style.display = 'flex';
      });
      nextBody.appendChild(tr);
    });
    if (!nextAlerts.length) nextBody.innerHTML = "<tr><td colspan='4' class='muted'>No upcoming alerts in queue.</td></tr>";

    templatesBody.innerHTML = '';
    templates.forEach((t) => {
      const tr = document.createElement('tr');
      const templateId = String(t.id || '');
      tr.innerHTML = `<td>${esc(t.name || t.id || '-')}</td><td>${esc(t.trigger || '-')}</td><td>${esc(t.subject || '-')}</td><td>${esc(t.bodyPreview || '-')}</td><td><div class='row' style='gap:.35rem;flex-wrap:wrap'><button class='btn btn-ghost' data-alert-preview-open='${esc(templateId)}'>Preview HTML</button><button class='btn btn-ghost' data-alert-test='${esc(templateId)}'>Send test</button></div></td>`;
      templatesBody.appendChild(tr);
    });
    if (!templates.length) templatesBody.innerHTML = "<tr><td colspan='5' class='muted'>No templates configured.</td></tr>";

    templatesBody.querySelectorAll('button[data-alert-preview-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const templateId = String(btn.getAttribute('data-alert-preview-open') || '');
        const template = templates.find((x) => String(x.id || '') === templateId);
        if (!template) {
          if (msg) msg.textContent = 'Template not found for preview.';
          return;
        }
        const html = String(template.html || '')
          .replaceAll('{eventTitle}', 'Nightly Prime')
          .replaceAll('{startTime}', '7:30 PM')
          .replaceAll('{recipientName}', 'Matt');

        const modal = ensureAlertsPreviewModal();
        const frame = modal.querySelector('#alerts-template-preview-frame');
        const title = modal.querySelector('#alerts-template-preview-title');
        const subjectEl = modal.querySelector('#alerts-template-preview-subject');
        let subject = String(template.subject || '');
        subject = subject.replaceAll('{eventTitle}', 'Nightly Prime').replaceAll('{startTime}', '7:30 PM').replaceAll('{recipientName}', 'Matt');
        if (title) title.textContent = `Template Preview • ${String(template.name || templateId)}`;
        if (subjectEl) subjectEl.innerHTML = `<strong style="color:#9fb3ce">Subject:</strong> ${esc(subject || '-')}`;
        if (frame) frame.srcdoc = `<!doctype html><html><head><meta charset='utf-8'/><meta name='viewport' content='width=device-width,initial-scale=1'/><title>Template Preview</title></head><body style='margin:0;background:#0b1219;'>${html}</body></html>`;
        modal.style.display = 'flex';
      });
    });

    templatesBody.querySelectorAll('button[data-alert-test]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const email = String(testEmailEl?.value || '').trim();
        if (!email || !email.includes('@')) {
          if (msg) msg.textContent = 'Enter a valid test email first.';
          return;
        }
        const templateId = String(btn.getAttribute('data-alert-test') || '');
        btn.disabled = true;
        try {
          await req(API.alertsTemplateTest, { method:'POST', body: JSON.stringify({ templateId, email }) });
          if (msg) msg.textContent = `Test sent: ${templateId} → ${email}`;
          loadAlertsMonitor().catch(()=>{});
        } catch (err) {
          const diag = err?.data?.diagnostics || {};
          const parts = [];
          if (diag.code) parts.push(`code=${diag.code}`);
          if (diag.responseCode) parts.push(`smtp=${diag.responseCode}`);
          if (diag.command) parts.push(`cmd=${diag.command}`);
          if (diag.host) parts.push(`host=${diag.host}`);
          if (diag.port) parts.push(`port=${diag.port}`);
          if (msg) msg.textContent = `${err.message || 'Test send failed.'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
        } finally {
          btn.disabled = false;
        }
      });
    });

    if (historyBody) {
      historyBody.innerHTML = '';
      history.forEach((h) => {
        const tr = document.createElement('tr');
        const when = Number(h.at || 0) > 0 ? new Date(Number(h.at)).toLocaleString('en-AU') : '-';
        tr.innerHTML = `<td>${esc(when)}</td><td>${esc(h.status || '-')}</td><td>${esc(h.templateId || '-')}</td><td>${esc(String(h.recipients || 0))}</td><td>${esc(h.note || '-')}</td>`;
        historyBody.appendChild(tr);
      });
      if (!history.length) historyBody.innerHTML = "<tr><td colspan='5' class='muted'>No delivery history yet.</td></tr>";
    }

    if (!filterEl?.dataset.bound) {
      filterEl.dataset.bound = '1';
      filterEl.addEventListener('change', () => loadAlertsMonitor().catch(()=>{}));
    }
    if (!searchEl?.dataset.bound) {
      searchEl.dataset.bound = '1';
      searchEl.addEventListener('input', () => loadAlertsMonitor().catch(()=>{}));
    }
    if (!sortEl?.dataset.bound) {
      sortEl.dataset.bound = '1';
      sortEl.addEventListener('change', () => loadAlertsMonitor().catch(()=>{}));
    }

    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.addEventListener('click', () => loadAlertsMonitor().catch(()=>{}));
    }

    if (exportBtn && !exportBtn.dataset.bound) {
      exportBtn.dataset.bound = '1';
      exportBtn.addEventListener('click', () => {
        const modeNow = String(filterEl?.value || 'all');
        const filtered = (alertsMonitorCache.subscribersRaw || []).filter((s) => {
          if (modeNow === 'verified') return Boolean(s.verifiedEmail);
          if (modeNow === 'overlay') return Boolean(s?.alerts?.overlayWatch);
          if (modeNow === 'no-mobile') return !String(s.phone || '').trim();
          return true;
        });
        const rows = [['username','email','verifiedEmail','phone','overlayWatch','lateReg','startingSoon','freerolls','cashActive']];
        filtered.forEach((s) => rows.push([
          String(s.username || ''),
          String(s.email || ''),
          String(Boolean(s.verifiedEmail)),
          String(s.phone || ''),
          String(Boolean(s?.alerts?.overlayWatch)),
          String(Boolean(s?.alerts?.lateReg)),
          String(Boolean(s?.alerts?.startingSoon)),
          String(Boolean(s?.alerts?.freerolls)),
          String(Boolean(s?.alerts?.cashActive))
        ]));
        const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `alerts-subscribers-${modeNow}-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      });
    }

    if (msg) msg.textContent = `Monitor refreshed ${new Date().toLocaleTimeString('en-AU')}.`;
  } catch (err) {
    if (msg) msg.textContent = err.message || 'Could not load alerts monitor data.';
  }
}

async function applyRolloverFromQueryIfRequested(){
  if (state.rolloverAppliedFromQuery) return;
  const params = new URLSearchParams(window.location.search || '');
  const shouldApply = params.get('apply') === '1';
  const rolloverRaw = params.get('rollover');
  if (!shouldApply || rolloverRaw == null) return;
  if (!isAdmin()) return;

  const rollover = Number(rolloverRaw);
  if (!Number.isFinite(rollover) || rollover < 0) {
    $('archive-round-msg').textContent = 'Invalid rollover in URL. Use ?rollover=80&apply=1';
    state.rolloverAppliedFromQuery = true;
    return;
  }

  try {
    const r = await req(withTrack(API.jackpot), { method: 'PUT', body: JSON.stringify({ rollover, trackId: state.trackId }) });
    const val = Number(r.jackpotCarry || 0);
    const input = $('jackpot-rollover-input');
    const current = $('jackpot-current');
    if (input) input.value = String(val);
    if (current) current.textContent = `Current rollover: $${val}`;
    $('archive-round-msg').textContent = `Applied jackpot rollover from URL: $${val}.`;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('rollover');
    clean.searchParams.delete('apply');
    history.replaceState({}, '', clean.toString());
  } catch (err) {
    $('archive-round-msg').textContent = `URL rollover apply failed: ${err.message}`;
  }

  state.rolloverAppliedFromQuery = true;
}

function fillResultsForm(race){
  const form = $('results-form');
  if(!form) return;
  const r = state.raceResults?.[race] || {};
  if (form.first) form.first.value = Array.isArray(r.first) ? r.first.join(',') : '';
  if (form.second) form.second.value = Array.isArray(r.second) ? r.second.join(',') : '';
  if (form.third) form.third.value = Array.isArray(r.third) ? r.third.join(',') : '';
  if (form.substitutions) {
    const subs = Array.isArray(r.substitutions) ? r.substitutions.map((s)=>`${s.scratched}>${s.substitute}`).join(', ') : '';
    form.substitutions.value = subs;
  }
}

function renderRaceOptions(){
  const fillSelect = (select, fallback='R1') => {
    if(!select) return;
    const prev = select.value;
    select.innerHTML = '';
    for(let i=1;i<=state.raceCount;i+=1){
      const opt = document.createElement('option');
      opt.value = `R${i}`;
      opt.textContent = `R${i}`;
      select.appendChild(opt);
    }
    select.value = prev || fallback;
  };

  fillSelect($('results-race'));
  fillSelect($('runners-import-race'));
  fillResultsForm($('results-race')?.value || 'R1');
}

function buildDefaultBossesWeekKey(){
  const now = new Date();
  return `Week of ${now.toLocaleDateString('en-AU', { day:'2-digit', month:'short', year:'numeric' })}`;
}

function renderBossesLegInputs(){
  const wrap = $('bosses-legs-v2');
  if(!wrap) return;
  const items = Array.isArray(state.bossesBet?.legItems) ? state.bossesBet.legItems : [];
  wrap.innerHTML = '';
  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class='pill'>Leg ${idx + 1}</span>
      <input type='text' name='leg-race-${idx}' placeholder='Race (e.g. R3)' value='${esc(item.race || '')}' style='max-width:96px' />
      <input type='text' name='leg-selection-${idx}' placeholder='Selection' value='${esc(item.selection || '')}' style='max-width:170px' />
      <select name='leg-type-${idx}' style='max-width:110px'>
        <option value='PLACE' ${String(item.betType||'').toUpperCase()==='PLACE' || String(item.betType||'').toUpperCase()==='P'?'selected':''}>Place</option>
        <option value='WIN' ${String(item.betType||'').toUpperCase()==='WIN' || String(item.betType||'').toUpperCase()==='W'?'selected':''}>Win</option>
        <option value='TOP3' ${String(item.betType||'').toUpperCase()==='TOP3'?'selected':''}>Top3</option>
        <option value='TOP2' ${String(item.betType||'').toUpperCase()==='TOP2'?'selected':''}>Top2</option>
        <option value='EACHWAY' ${String(item.betType||'').toUpperCase()==='EACHWAY'?'selected':''}>Each Way</option>
      </select>
      <input type='text' name='leg-odds-${idx}' placeholder='Odds' value='${esc(item.odds || '')}' style='max-width:90px' />
      <select name='leg-result-${idx}' style='max-width:118px'>
        <option value='PENDING' ${String(item.result||'PENDING').toUpperCase()==='PENDING'?'selected':''}>Pending</option>
        <option value='WON' ${String(item.result||'').toUpperCase()==='WON'?'selected':''}>Won</option>
        <option value='LOST' ${String(item.result||'').toUpperCase()==='LOST'?'selected':''}>Lost</option>
      </select>
      <button class='btn btn-ghost' type='button' data-remove-leg='${idx}'>Remove</button>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll('[data-remove-leg]').forEach((btn)=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-remove-leg'));
      state.bossesBet.legItems = (state.bossesBet.legItems || []).filter((_, i) => i !== idx);
      renderBossesLegInputs();
    });
  });
}

function computePopularByRace(tips){
  const byRace = new Map();
  (tips || []).filter(t=>t.status!=='removed').forEach((t)=>{
    const race = String(t.race || '').toUpperCase();
    const sel = String(t.selection || t.horse || '').trim();
    if(!race || !sel) return;
    if(!byRace.has(race)) byRace.set(race, new Map());
    const m = byRace.get(race);
    m.set(sel, (m.get(sel) || 0) + 1);
  });

  const out = {};
  for(const [race,m] of byRace.entries()){
    const sorted = [...m.entries()].sort((a,b)=>b[1]-a[1] || Number(a[0])-Number(b[0]) || String(a[0]).localeCompare(String(b[0])));
    if(sorted[0]) out[race] = { selection: sorted[0][0], votes: sorted[0][1] };
  }
  return out;
}

function renderBossesSuggested(popular){
  const box = $('bosses-suggested');
  if(!box) return;
  const races = Array.from({length:state.raceCount},(_,i)=>`R${i+1}`);
  const lines = races.filter(r=>popular[r]).map((r)=>`${r}: ${popular[r].selection} (${popular[r].votes} votes)`);
  box.textContent = lines.length ? `Most popular picks → ${lines.join(' • ')}` : 'No tip data yet to auto-calculate Bosses Bet.';
}

function renderRunnersPreview(){
  const body = $('runners-preview-body');
  if(!body) return;
  const rows = Array.isArray(state.parsedRunners) ? state.parsedRunners : [];
  body.innerHTML = '';
  if(!rows.length){
    body.innerHTML = "<tr><td colspan='10' class='muted'>No parsed runners yet.</td></tr>";
    return;
  }
  rows.forEach((r)=>{
    const tr=document.createElement('tr');
    const status = r.isScratched ? 'SCR' : 'Active';
    tr.innerHTML = `<td>${esc(r.horseName || '—')}</td><td>${r.barrier ?? '—'}</td><td>${esc(r.form || '—')}</td><td>${r.weightKg ?? '—'}</td><td>${r.rating ?? '—'}</td><td>${r.prices?.win ?? '—'}</td><td>${r.prices?.place ?? '—'}</td><td><span class='pill ${r.isScratched?'chip-red':''}'>${status}</span></td><td>${esc((r.warnings||[]).join('; ') || '—')}</td><td>${esc(r.confidence || '—')}</td>`;
    body.appendChild(tr);
  });
}

function renderBossesDraft(){
  const card = $('bosses-draft-card');
  const summary = $('bosses-draft-summary');
  const legsBody = $('bosses-draft-legs');
  const diffList = $('bosses-diff-list');
  const badge = $('bosses-verify-badge');
  if(!card || !summary || !legsBody || !diffList || !badge) return;

  const d = state.bossesDraft;
  if(!d){
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const merged = d.mergedDraft || {};
  const stake = merged.stake_aud == null ? '—' : `$${Number(merged.stake_aud).toFixed(2)}`;
  const ret = merged.potential_return_aud == null ? '—' : `$${Number(merged.potential_return_aud).toFixed(2)}`;
  summary.innerHTML = `
    <p><strong>Track/Meet:</strong> ${esc(merged.track || '—')} / ${esc(merged.meet || '—')}</p>
    <p><strong>Bet type:</strong> Multi</p>
    <p><strong>Stake:</strong> ${esc(stake)} · <strong>Potential Return:</strong> ${esc(ret)}</p>
  `;

  legsBody.innerHTML = '';
  const legs = Array.isArray(merged.legs) ? merged.legs : [];
  if(!legs.length){
    legsBody.innerHTML = "<tr><td colspan='6' class='muted'>No legs detected.</td></tr>";
  } else {
    legs.forEach((l)=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${Number(l.leg||0)||'—'}</td><td>${l.race==null?'—':`R${Number(l.race)}`}</td><td>${esc(l.selection||'—')}</td><td>${esc(l.bet_type||'UNKNOWN')}</td><td>${l.odds==null?'—':esc(String(l.odds))}</td><td>${esc(l.result||'Pending')}</td>`;
      legsBody.appendChild(tr);
    });
  }

  const diffs = Array.isArray(d.diffs) ? d.diffs : [];
  if(!diffs.length){
    badge.textContent = 'Verified ✅';
    badge.classList.remove('chip-red');
    diffList.textContent = 'Pass 1 and Pass 2 match closely.';
  } else {
    badge.textContent = 'Needs review ⚠️';
    badge.classList.add('chip-red');
    diffList.innerHTML = `<strong>Differences detected:</strong> ${diffs.map((x)=>esc(x.field)).join(' • ')}`;
  }
}

function fillBossesFormFromDraft(){
  const d = state.bossesDraft?.mergedDraft;
  if(!d) return;
  if($('bosses-meet') && d.meet) $('bosses-meet').value = d.meet;
  if($('bosses-status')) $('bosses-status').value = String(d.status || 'LIVE').toUpperCase();
  if($('bosses-stake')) $('bosses-stake').value = '$25';
  if($('bosses-potential-return') && d.potential_return_aud != null) $('bosses-potential-return').value = `$${Number(d.potential_return_aud).toFixed(2)}`;
  if($('bosses-title') && !$('bosses-title').value.trim()) $('bosses-title').value = 'Bosses Multi';
  if($('bosses-week-key') && !$('bosses-week-key').value.trim()) $('bosses-week-key').value = buildDefaultBossesWeekKey();
  if($('bosses-eligibility-note') && d.eligibility_note) $('bosses-eligibility-note').value = d.eligibility_note;

  const legs = Array.isArray(d.legs) ? d.legs : [];
  state.bossesBet.legItems = legs.map((l,idx)=>(
    {
      legNumber: Number(l.leg || idx + 1),
      race: l.race == null ? '' : `R${Number(l.race)}`,
      selection: String(l.selection || ''),
      betType: String(l.bet_type || 'UNKNOWN').toUpperCase() === 'UNKNOWN' ? 'PLACE' : String(l.bet_type || 'PLACE').toUpperCase(),
      odds: l.odds == null ? '' : String(l.odds),
      result: String(l.result || 'Pending').toUpperCase()
    }
  ));
  renderBossesLegInputs();
  toastBosses('Draft applied to form. Review then click Save / Update Bosses Multi.','ok');
}


async function refreshClaims(){

  const body = $('claims-body');
  if(!body || !isAdmin()) return;
  try {
    const out = await req(withTrack(API.puntersClaims));
    const rows = (out.claims || []).filter((c)=>String(c.status||'pending')==='pending');
    body.innerHTML = '';
    if(!rows.length){ body.innerHTML = "<tr><td colspan='4' class='muted'>No pending claims.</td></tr>"; return; }
    rows.forEach((c)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(c.member||'-')}</td><td>$${Number(c.amount||0).toFixed(2)}</td><td>${esc(c.status||'pending')}</td><td><button class='btn btn-ghost' data-claim-id='${encodeURIComponent(String(c.id||''))}'>Mark Paid</button></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll('button[data-claim-id]').forEach((btn)=>{
      btn.addEventListener('click', async ()=>{
        try {
          await req(withTrack(API.puntersVerifyPayout), { method:'POST', body: JSON.stringify({ claimId: decodeURIComponent(btn.dataset.claimId || '') })});
          $('punters-payment-msg').textContent = 'Claim marked as paid.';
          await refreshClaims();
        } catch (err) { $('punters-payment-msg').textContent = err.message; }
      });
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan='4' class='muted'>${esc(err.message || 'Could not load claims')}</td></tr>`;
  }
}

async function bootstrap(){if(!state.token)return;try{state.user=(await req(API.me)).user;}catch{state.token=null;state.user=null;localStorage.removeItem(tokenKey);}}

async function refresh(){
  $('auth-controls').innerHTML=state.user?`<span class='profile-chip'><a class='pill' href='/profile' style='text-decoration:none'>${esc(state.user.username)} (${esc(state.user.role)})</a><a class='menu-link' href='/profile#settings' aria-label='Settings' title='Settings'>⚙️</a></span><button class='btn btn-ghost' id='logout-btn'>Log Out</button>`:`<span class='pill'>Logged out</span>`;
  const b=$('logout-btn'); if(b)b.onclick=logout;
  const adminOnly=$('admin-only');
  const loginCard=$('admin-login-card');
  if(adminOnly) adminOnly.style.display=isAdmin()?'grid':'none';
  if(loginCard) loginCard.style.display=isAdmin()?'none':'block';
  $('admin-list').innerHTML='';
  updateTrackLabels();
  renderAdminSummaryCounts();
  if(!isAdmin()){ return; }
  applyAdminViewFilter();

  try {
    const fx = await req(withTrack(API.fixtures));
    const meet = (fx.fixtures || [])[0] || {};
    state.fixtureId = String(meet.id || `pc-${state.trackId}-f1`);
    state.raceCount = Number(meet.raceCount || 12);
    const form = $('fixture-form');
    if (form) {
      if ((form.dateOnly || form.timeOnly) && (!form.dateOnly?.value || !form.timeOnly?.value)) {
        const parsed = parseAnyDateInput(meet.date || '');
        if (parsed) {
          const local = toDateTimeLocalValue(parsed);
          const [dPart, tPart] = String(local).split('T');
          if (form.dateOnly && !form.dateOnly.value) form.dateOnly.value = dPart || '';
          if (form.timeOnly && !form.timeOnly.value) form.timeOnly.value = tPart || '';
        }
      }
      if (form.event && !form.event.value) form.event.value = meet.event || '';
      if (form.track && !form.track.value) form.track.value = meet.track || '';
      if (form.raceCount) form.raceCount.value = String(meet.raceCount || 12);
    }
  } catch {}

  try {
    const rr = await req(withTrack(API.results));
    state.raceResults = rr.raceResults || {};
  } catch { state.raceResults = {}; }

  try {
    const rs = await req(withTrack(API.raceRunners));
    state.raceRunners = rs.raceRunners || {};
  } catch { state.raceRunners = {}; }

  renderRaceOptions();
  renderRunnersPreview();

  try {
    const bb = await req(withTrack(API.bossesBet));
    state.bossesBet = bb.bossesBet || { legs:[], selections:{}, legItems:[] };
  } catch {
    state.bossesBet = { legs:[], selections:{}, legItems:[] };
  }

  if (!Array.isArray(state.bossesBet.legItems) || !state.bossesBet.legItems.length) {
    const races = Array.isArray(state.bossesBet.legs) ? state.bossesBet.legs : [];
    state.bossesBet.legItems = races.map((race, idx) => ({
      legNumber: idx + 1,
      race,
      selection: String(state.bossesBet.selections?.[race] || ''),
      betType: 'PLACE',
      odds: '',
      result: 'PENDING'
    }));
  }

  if ($('bosses-title')) $('bosses-title').value = String(state.bossesBet.title || 'Bosses Multi');
  if ($('bosses-week-key')) $('bosses-week-key').value = String(state.bossesBet.weekKey || buildDefaultBossesWeekKey());
  if ($('bosses-meet')) $('bosses-meet').value = String(state.bossesBet.meet || '');
  if ($('bosses-status')) $('bosses-status').value = String(state.bossesBet.status || 'live').toUpperCase();
  if ($('bosses-freeroll-prize')) $('bosses-freeroll-prize').value = Number(state.bossesBet.freerollPrize || 0);
  if ($('bosses-eligibility-note')) $('bosses-eligibility-note').value = String(state.bossesBet.eligibilityNote || 'Eligible = all players who entered tips this week before lock.');
  if ($('bosses-stake')) $('bosses-stake').value = '$25';
  if ($('bosses-potential-return')) $('bosses-potential-return').value = String(state.bossesBet.potentialReturn || '');
  if ($('bosses-lock-time')) {
    const lockMs = Number(state.bossesBet.lockTime || 0);
    $('bosses-lock-time').value = lockMs > 0 ? new Date(lockMs).toISOString().slice(0,16) : '';
  }

  renderBossesLegInputs();
  renderBossesDraft();

  try {
    const dl = await req(API.tipEditDeadline);
    const node = $('tip-unlock-status');
    if (node) {
      const when = dl?.effectiveDeadlineMs ? new Date(Number(dl.effectiveDeadlineMs)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' }) : 'Unknown';
      node.textContent = `Tip edits are currently ${dl?.editableNow ? 'OPEN' : 'LOCKED'} until ${when}.`;
    }
    const dt = $('tip-lockout-datetime');
    if (dt && dl?.effectiveDeadlineMs) {
      const d = new Date(Number(dl.effectiveDeadlineMs));
      const pad = (n) => String(n).padStart(2, '0');
      dt.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  } catch {}

  try {
    const j = await req(withTrack(API.jackpot));
    const rollover = Number(j?.rollover || 0);
    const input = $('jackpot-rollover-input');
    const current = $('jackpot-current');
    if (input) input.value = String(rollover);
    if (current) current.textContent = `Current rollover: $${rollover}`;
  } catch {}

  try {
    const out = await req(withTrack(API.puntersRounds));
    const rounds = out.rounds || [];
    renderRoundHistoryTable(rounds);
    const openRound = rounds.find((r)=>String(r.status||'').toLowerCase()==='open') || null;
    const latestClosed = rounds.filter((r)=>String(r.status||'').toLowerCase()==='closed').sort((a,b)=>Number(b.closedAt||0)-Number(a.closedAt||0))[0] || null;
    const target = openRound || latestClosed;

    const form = $('round-winner-form');
    if (form && target) {
      const winner = String(target?.winner?.member || target?.snapshot?.winner?.member || '').trim();
      const payout = Number(target?.winner?.payout ?? target?.snapshot?.winner?.payout ?? target?.snapshot?.finalPotAmount ?? 0);
      const notes = String(target?.winner?.notes || target?.snapshot?.winner?.notes || '').trim();
      if (form.winner) form.winner.value = winner || '';
      if (form.payout) form.payout.value = Number.isFinite(payout) ? String(payout) : '';
      if (form.notes) form.notes.value = notes || '';
    }

    const nextOpenMs = Number(target?.nextRoundOpensAt || 0);
    const nextOpenInput = $('next-round-opens-at');
    if (nextOpenInput && nextOpenMs > 0) nextOpenInput.value = toDateTimeLocalValue(nextOpenMs);

    let liveLeader = null;
    let livePot = 0;
    try {
      const [ladderOut, jackpotOut] = await Promise.all([
        req(withTrack(API.ladder)),
        req(withTrack(API.jackpot))
      ]);
      liveLeader = (ladderOut?.ladder || [])[0] || null;
      livePot = Number(jackpotOut?.totalPot || 0);
    } catch {}

    renderRoundStatusCard(target, { leader: liveLeader, totalPot: livePot });

    const msg = $('archive-round-msg');
    if (msg && target) {
      const isOpen = String(target.status || '').toLowerCase() === 'open';
      const winner = isOpen
        ? (String(liveLeader?.member || '').trim() || String(target?.winner?.member || '').trim() || 'TBD')
        : (String(target?.winner?.member || target?.snapshot?.winner?.member || '').trim() || 'TBD');
      const payout = isOpen
        ? Number(livePot || 0)
        : Number(target?.winner?.payout ?? target?.snapshot?.winner?.payout ?? target?.snapshot?.finalPotAmount ?? 0);
      const closedAt = Number(target?.closedAt || 0);
      msg.textContent = isOpen
        ? `Live round: ${target.label || target.id}. Leader now ${winner}${Number.isFinite(payout) ? ` • projected payout $${payout}` : ''}. Winner auto-finalises after final race result.`
        : `Round closed: ${target.label || target.id}. Winner ${winner}${Number.isFinite(payout) ? ` • payout $${payout}` : ''}${closedAt ? ` • closed ${formatMelbourne(closedAt)}` : ''}.`;
    }
  } catch {}

  await applyRolloverFromQueryIfRequested();

  const p=await req(`${API.tips}?status=all&track=${encodeURIComponent(state.trackId)}`);
  state.tipsAll = p.tips || [];
  state.popularByRace = computePopularByRace(state.tipsAll);
  renderBossesSuggested(state.popularByRace);

  let hasOpenRound = false;
  try {
    const ro = await req(withTrack(API.puntersRounds));
    hasOpenRound = (ro.rounds || []).some((r)=>String(r.status||'').toLowerCase()==='open');
  } catch {}

  const activeTips = hasOpenRound ? (p.tips || []).filter((t) => t.status !== 'removed') : [];
  state.summary.tipUsers = new Set(activeTips.map((t) => String(t.member || '').trim()).filter(Boolean)).size;
  state.summary.paidUsers = new Set(activeTips.filter((t) => t.paid).map((t) => String(t.member || '').trim()).filter(Boolean)).size;

  try {
    // Use Poker V2 totals so admin count matches /api/poker/results and winners/public views.
    const pokerAll = await req('/poker/results?page=1&pageSize=10');
    state.summary.pokerEvents = Number(pokerAll?.total || 0);
  } catch {
    // Fallback to legacy endpoint for resilience on older deployments.
    try {
      const legacy = await req(`${API.pokerLeaderboard}?range=all`);
      state.summary.pokerEvents = Number(legacy?.stats?.events || 0);
    } catch {
      state.summary.pokerEvents = state.summary.pokerEvents || 0;
    }
  }

  renderAdminSummaryCounts();
  refreshPokerPlayerOptions().catch(()=>{});
  loadAdminUsers().catch(()=>{});
  loadAlertsMonitor().catch(()=>{});
  refreshClaims().catch(()=>{});

  if (!hasOpenRound) {
    $('admin-list').innerHTML = '<p class="muted">No OPEN round currently. Tip list hidden between rounds.</p>';
    return;
  }

  if(!p.tips?.length){$('admin-list').innerHTML='<p class="muted">No tips submitted yet.</p>';return;}

  const byUser = new Map();
  (p.tips || []).filter(t=>t.status!=='removed').forEach((t) => {
    const member = String(t.member || 'Unknown');
    if (!byUser.has(member)) byUser.set(member, []);
    byUser.get(member).push(t);
  });

  Array.from(byUser.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([member, tips]) => {
      const allPaid = tips.length > 0 && tips.every(t => t.paid);
      const lines = tips
        .sort((a,b)=>Number(String(a.race||'R0').slice(1))-Number(String(b.race||'R0').slice(1)))
        .map((t) => `<span>${esc(t.race)}: ${esc(t.selection || t.horse || '')}</span>`)
        .join(' • ');
      const row = document.createElement('div');
      row.className = 'row';
      row.style.alignItems = 'flex-start';
      row.innerHTML = `<div><strong>${esc(member)}</strong><div class='muted'>${tips.length} race${tips.length===1?'':'s'} tipped • ${allPaid ? 'Paid' : 'Unpaid'}</div><div class='muted'>${lines}</div></div><div class='row-actions'><button class='btn btn-ghost' data-action='toggle-paid' data-member='${encodeURIComponent(member)}' data-paid='${allPaid ? 'false' : 'true'}'>Mark ${allPaid ? 'Unpaid' : 'Paid'}</button><button class='btn btn-ghost' data-action='edit-tips' data-member='${encodeURIComponent(member)}'>Edit Tips</button></div>`;
      $('admin-list').appendChild(row);
    });

  $('admin-list').querySelectorAll("button[data-action='toggle-paid']").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const member = decodeURIComponent(btn.dataset.member || '');
        const nextPaid = btn.dataset.paid === 'true';
        const tipsForMember = (p.tips || []).filter(t => String(t.member||'') === member && t.status !== 'removed');
        for (const tip of tipsForMember) {
          await req(API.updateTip(tip.id), { method: 'PATCH', body: JSON.stringify({ paid: nextPaid }) });
        }
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    };
  });

  $('admin-list').querySelectorAll("button[data-action='edit-tips']").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const member = decodeURIComponent(btn.dataset.member || '');
        const tipsForMember = (p.tips || [])
          .filter(t => String(t.member||'') === member && t.status !== 'removed')
          .sort((a,b)=>Number(String(a.race||'R0').slice(1))-Number(String(b.race||'R0').slice(1)));

        const current = tipsForMember.map((t)=>`${t.race}=${t.selection || ''}`).join(', ');
        const raw = prompt(`Edit tips for ${member}.\nFormat: R1=4, R2=9\n(Only existing tipped races can be edited)`, current);
        if (raw == null) return;

        const updates = raw.split(',').map((x)=>x.trim()).filter(Boolean).map((entry)=>{
          const [raceRaw, selRaw] = entry.split('=').map((v)=>String(v||'').trim());
          return { race: raceRaw.toUpperCase(), selection: selRaw };
        }).filter((x)=>/^R\d+$/i.test(x.race) && x.selection);

        if(!updates.length){ alert('No valid edits found. Use format like R1=4, R2=9'); return; }

        const tipByRace = new Map(tipsForMember.map((t)=>[String(t.race||'').toUpperCase(), t]));
        const missing = [];
        for (const u of updates) {
          const tip = tipByRace.get(u.race);
          if (!tip) { missing.push(u.race); continue; }
          await req(API.updateTip(tip.id), { method:'PATCH', body: JSON.stringify({ selection: u.selection }) });
        }

        if (missing.length) {
          alert(`Updated existing races. Could not edit ${missing.join(', ')} because no tip exists yet for those races.`);
        }
        await refresh();
      } catch (err) {
        alert(err.message);
      }
    };
  });
}


function toDateTimeLocalValue(ms){
  const d = new Date(Number(ms || 0));
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseAnyDateInput(value){
  const s = String(value || '').trim();
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function formatMelbourne(ms){
  const n = Number(ms || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' });
}

function setRoundWinnerFormDisabled(disabled){
  const form = $('round-winner-form');
  if (!form) return;
  ['winner','payout','notes','nextRoundOpensAt'].forEach((name)=>{
    const el = form[name];
    if (el) el.disabled = Boolean(disabled);
  });
  const pill = $('winner-override-pill');
  if (pill) pill.textContent = disabled ? 'Override OFF' : 'Override ON';
  const btn = $('winner-override-btn');
  if (btn) btn.textContent = disabled ? 'Enable Override' : 'Disable Override';
}

async function withButtonFeedback(buttonId, workingLabel, fn){
  const btn = $(buttonId);
  const msg = $('archive-round-msg');
  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = workingLabel;
    btn.classList.add('is-busy');
  }
  try {
    await fn();
  } catch (err) {
    if (msg) msg.textContent = err?.message || 'Action failed.';
    throw err;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
      btn.classList.remove('is-busy');
    }
  }
}

function renderRoundStatusCard(target, live = {}){
  const pill = $('round-status-pill');
  const label = $('round-status-label');
  const winner = $('round-status-winner');
  const payout = $('round-status-payout');
  const closed = $('round-status-closed');
  const nextOpen = $('round-status-next-open');
  const hint = $('round-status-hint');
  if (!pill || !label || !winner || !payout || !closed || !nextOpen || !hint) return;

  if (!target) {
    pill.textContent = 'No round';
    label.textContent = '—';
    winner.textContent = '—';
    payout.textContent = '—';
    closed.textContent = '—';
    nextOpen.textContent = '—';
    hint.textContent = 'No round found yet.';
    return;
  }

  const isOpen = String(target.status || '').toLowerCase() === 'open';
  const declaredWinner = String(target?.winner?.member || target?.snapshot?.winner?.member || '').trim();
  const projectedWinner = String(live?.leader?.member || '').trim();
  const winnerName = isOpen ? (projectedWinner || declaredWinner || 'TBD') : (declaredWinner || projectedWinner || 'TBD');
  const declaredPayout = Number(target?.winner?.payout ?? target?.snapshot?.winner?.payout ?? target?.snapshot?.finalPotAmount ?? 0);
  const projectedPayout = Number(live?.totalPot ?? 0);
  const payoutNum = isOpen ? projectedPayout : (declaredPayout > 0 ? declaredPayout : projectedPayout);
  const closedAt = Number(target?.closedAt || 0);
  const nextOpenMs = Number(target?.nextRoundOpensAt || 0);

  pill.textContent = isOpen ? 'LIVE' : 'CLOSED';
  label.textContent = String(target.label || target.id || '—');
  winner.textContent = winnerName;
  payout.textContent = Number.isFinite(payoutNum) && payoutNum >= 0 ? `$${payoutNum}` : '—';
  closed.textContent = isOpen ? 'Not closed yet' : formatMelbourne(closedAt);
  nextOpen.textContent = nextOpenMs > 0 ? formatMelbourne(nextOpenMs) : '—';
  hint.textContent = isOpen
    ? (declaredWinner ? 'Round is live with winner override set. Auto-finalise still runs at final result.' : 'Live projected winner from ladder API. Auto-finalises after final race result.')
    : 'Round is closed. Use Override only if you need to correct winner metadata.';
}

function renderRoundHistoryTable(rounds = []){
  const body = $('round-history-body');
  if (!body) return;
  body.innerHTML = '';
  if (!rounds.length) {
    body.innerHTML = "<tr><td colspan='7' class='muted'>No rounds found.</td></tr>";
    return;
  }

  rounds
    .slice()
    .sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))
    .forEach((r)=>{
      const winner = String(r?.winner?.member || r?.snapshot?.winner?.member || '').trim() || '—';
      const payout = Number(r?.winner?.payout ?? r?.snapshot?.winner?.payout ?? r?.snapshot?.finalPotAmount ?? 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input type='checkbox' data-round-check='${encodeURIComponent(String(r.id||''))}' /></td><td>${esc(r.label || r.id || '—')}</td><td>${esc(String(r.status || '').toUpperCase())}</td><td>${esc(winner)}</td><td>${Number.isFinite(payout)?`$${payout}`:'—'}</td><td>${esc(formatMelbourne(r.closedAt || r.createdAt))}</td><td><button class='btn btn-ghost' data-round-delete='${encodeURIComponent(String(r.id||''))}'>Delete</button></td>`;
      body.appendChild(tr);
    });

  body.querySelectorAll('button[data-round-delete]').forEach((btn)=>{
    btn.addEventListener('click', async ()=>{
      const id = decodeURIComponent(btn.dataset.roundDelete || '');
      if (!id) return;
      if (!confirm('Delete this round permanently?')) return;
      await withButtonFeedback('round-delete-selected-btn', 'Deleting…', async ()=>{
        await req(withTrack(API.deleteRound(id)), { method:'DELETE' });
        await refresh();
        const out = await req(withTrack(API.puntersRounds));
        const openCount = (out.rounds || []).filter((r)=>String(r.status||'').toLowerCase()==='open').length;
        $('archive-round-msg').textContent = openCount > 0
          ? `Round deleted. ${openCount} OPEN round(s) still exist.`
          : 'Round deleted. No open round remains; status now reflects latest closed round.';
      }).catch(()=>{});
    });
  });
}

async function getCurrentPuntersRound(){
  const out = await req(withTrack(API.puntersRounds));
  const rounds = out.rounds || [];
  const open = rounds.find((r)=>String(r.status||'').toLowerCase()==='open') || null;
  const latestClosed = rounds
    .filter((r)=>String(r.status||'').toLowerCase()==='closed')
    .sort((a,b)=>Number(b.closedAt||0)-Number(a.closedAt||0))[0] || null;
  return open || latestClosed || rounds[0] || null;
}

async function getOpenPuntersRound(){
  const out = await req(withTrack(API.puntersRounds));
  const rounds = out.rounds || [];
  return rounds.find((r)=>String(r.status||'').toLowerCase()==='open') || null;
}

function getRoundWinnerPayload(){
  const form = $('round-winner-form');
  const f = form ? new FormData(form) : new FormData();
  const rawOpen = String(f.get('nextRoundOpensAt') || '').trim();
  const openAt = rawOpen ? new Date(rawOpen).getTime() : null;
  return {
    winner: String(f.get('winner') || 'tofu').trim() || 'tofu',
    payout: Number(f.get('payout') || 0),
    notes: String(f.get('notes') || '').trim(),
    nextRoundOpensAt: Number.isFinite(openAt) ? openAt : undefined
  };
}

$('winner-override-btn')?.addEventListener('click', () => {
  const form = $('round-winner-form');
  if (!form) return;
  const disabled = Boolean(form.winner?.disabled);
  setRoundWinnerFormDisabled(!disabled);
  const msg = $('archive-round-msg');
  if (msg) msg.textContent = disabled
    ? 'Override enabled. Winner fields are now editable.'
    : 'Override disabled. Winner fields are locked.';
});

$('round-history-refresh-btn')?.addEventListener('click', async () => {
  await withButtonFeedback('round-history-refresh-btn', 'Refreshing…', async () => {
    await refresh();
    $('archive-round-msg').textContent = 'Round history refreshed.';
  }).catch(()=>{});
});

$('round-select-all-btn')?.addEventListener('click', () => {
  document.querySelectorAll('[data-round-check]').forEach((el)=>{ el.checked = true; });
});

$('round-clear-select-btn')?.addEventListener('click', () => {
  document.querySelectorAll('[data-round-check]').forEach((el)=>{ el.checked = false; });
});

$('round-delete-selected-btn')?.addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('[data-round-check]:checked')]
    .map((el)=>decodeURIComponent(el.getAttribute('data-round-check') || ''))
    .filter(Boolean);
  if (!ids.length) {
    $('archive-round-msg').textContent = 'Select one or more rounds first.';
    return;
  }
  if (!confirm(`Delete ${ids.length} selected round(s) permanently?`)) return;

  await withButtonFeedback('round-delete-selected-btn', 'Deleting…', async () => {
    for (const id of ids) {
      await req(withTrack(API.deleteRound(id)), { method:'DELETE' });
    }
    await refresh();
    const out = await req(withTrack(API.puntersRounds));
    const openCount = (out.rounds || []).filter((r)=>String(r.status||'').toLowerCase()==='open').length;
    $('archive-round-msg').textContent = openCount > 0
      ? `Deleted ${ids.length} round(s). ${openCount} OPEN round(s) still exist.`
      : `Deleted ${ids.length} round(s). No open round remains; status now reflects latest closed round.`;
  }).catch(()=>{});
});

$('publish-winner-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  await withButtonFeedback('publish-winner-btn', 'Publishing…', async () => {
    const round = await getCurrentPuntersRound();
    if(!round){ $('archive-round-msg').textContent='No round found.'; return; }
    const payload = getRoundWinnerPayload();
    await req(withTrack(API.publishWinner(round.id)), { method:'POST', body: JSON.stringify(payload) });
    $('archive-round-msg').textContent = `Winner published for ${round.label || 'selected round'}.`;
    await refresh();
  }).catch(()=>{});
});

$('close-round-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  await withButtonFeedback('close-round-btn', 'Closing…', async () => {
    const round = await getOpenPuntersRound();
    if(!round){ $('archive-round-msg').textContent='No OPEN round found. Nothing to close.'; return; }
    const payload = getRoundWinnerPayload();
    await req(withTrack(API.closeRound(round.id)), { method:'POST', body: JSON.stringify(payload) });
    $('archive-round-msg').textContent = `Round closed and snapshot frozen: ${round.label || round.id}.`;
    await refresh();
  }).catch(()=>{});
});

$('recompute-snapshot-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  await withButtonFeedback('recompute-snapshot-btn', 'Recomputing…', async () => {
    const round = await getCurrentPuntersRound();
    if(!round){ $('archive-round-msg').textContent='No round found.'; return; }
    await req(withTrack(API.recomputeSnapshot(round.id)), { method:'POST' });
    $('archive-round-msg').textContent = 'Snapshot recomputed and frozen.';
    await refresh();
  }).catch(()=>{});
});

$('open-next-round-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  await withButtonFeedback('open-next-round-btn', 'Opening…', async () => {
    const payload = getRoundWinnerPayload();
    await req(withTrack(API.openNextRound), { method:'POST', body: JSON.stringify({ nextRoundOpensAt: payload.nextRoundOpensAt }) });
    $('archive-round-msg').textContent = 'Next round opened.';
    await refresh();
  }).catch(()=>{});
});

$('round-winner-form')?.addEventListener('change', async () => {
  if(!isAdmin()) return;
  try {
    const payload = getRoundWinnerPayload();
    if (payload.nextRoundOpensAt) {
      await req(withTrack(API.puntersSettings), { method:'PUT', body: JSON.stringify({ nextRoundOpensAt: payload.nextRoundOpensAt }) });
    }
  } catch {}
});

$('punters-payment-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('punters-payment-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  try {
    await req(withTrack(API.puntersVerifyPayment), { method:'POST', body: JSON.stringify({
      member: String(f.get('member') || '').trim(),
      amount: Number(f.get('amount') || 20),
      reference: String(f.get('reference') || '').trim()
    })});
    $('punters-payment-msg').textContent = 'Payment verified and member upgraded to Jackpot Eligible.';
    e.target.reset();
    await refresh();
  } catch (err) {
    $('punters-payment-msg').textContent = err.message || 'Could not verify payment.';
  }
});
$('refresh-claims-btn')?.addEventListener('click', ()=>refreshClaims().catch(()=>{}));

$('login-form').addEventListener('submit',async(e)=>{e.preventDefault();const f=new FormData(e.target);const username=String(f.get('member')||'').trim();const password=String(f.get('pin')||'').trim();try{const r=await req(API.login,{method:'POST',body:JSON.stringify({username,password})});state.token=r.token;state.user=r.user;localStorage.setItem(tokenKey,state.token);$('login-msg').textContent='Logged in.';await refresh();}catch(err){$('login-msg').textContent=err.message;}});

$('fixture-form').addEventListener('submit',async(e)=>{e.preventDefault();if(!isAdmin()){ $('fixture-msg').textContent='Admin login required.'; return; }const f=new FormData(e.target);const dateOnly=String(f.get('dateOnly')||'').trim();const timeOnly=String(f.get('timeOnly')||'').trim();const rawDate=(dateOnly&&timeOnly)?`${dateOnly}T${timeOnly}`:dateOnly;const parsedMs=parseAnyDateInput(rawDate);const normalizedDate=parsedMs?new Date(parsedMs).toLocaleString('en-AU',{timeZone:'Australia/Melbourne',weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).replace(',',''):rawDate;try{await req(withTrack(API.updateFixture(state.fixtureId || `pc-${state.trackId}-f1`)),{method:'PUT',body:JSON.stringify({date:normalizedDate,event:String(f.get('event')||'').trim(),track:String(f.get('track')||'').trim(),raceCount:Number(f.get('raceCount')||12),trackId:state.trackId})});$('fixture-msg').textContent=`Fixture updated (${state.trackId}).`;await refresh();}catch(err){$('fixture-msg').textContent=err.message;}});

$('archive-round-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  if(!confirm('Archive current meet tips/results and reset active round?')) return;
  await withButtonFeedback('archive-round-btn', 'Archiving…', async () => {
    const r = await req(withTrack(API.archiveRound), { method: 'POST', body: JSON.stringify({ trackId: state.trackId }) });
    const outcome = r.outrightWinner
      ? `Outright winner: ${r.outrightWinner}. Jackpot resets.`
      : `No outright winner. Jackpot rolls to next week: $${Number(r.rolloverToNextWeek || 0)}.`;
    $('archive-round-msg').textContent = `Archived ${r.tipsArchived || 0} tips${r.fixture ? ` from ${r.fixture}` : ''}. ${outcome}`;
    await refresh();
  }).catch(()=>{});
});

$('unlock-sat-noon-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  if(!confirm('Unlock tip edits until next Saturday 12:00 PM (Melbourne time)?')) return;
  await withButtonFeedback('unlock-sat-noon-btn', 'Unlocking…', async () => {
    const r = await req(API.unlockSatNoon, { method: 'POST' });
    const local = new Date(Number(r.deadlineMs || 0)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' });
    $('archive-round-msg').textContent = `Tips unlocked until ${local}.`;
    await refresh();
  }).catch(()=>{});
});

$('tip-lockout-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  const raw = String($('tip-lockout-datetime')?.value || '').trim();
  const ms = raw ? new Date(raw).getTime() : NaN;
  if (!Number.isFinite(ms) || ms <= Date.now()) {
    $('archive-round-msg').textContent = 'Enter a valid future lockout date/time.';
    return;
  }
  try {
    const r = await req(API.tipEditDeadline, { method: 'PUT', body: JSON.stringify({ deadlineMs: ms }) });
    const local = new Date(Number(r.deadlineMs || ms)).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'full', timeStyle: 'short' });
    $('archive-round-msg').textContent = `Tip lockout deadline set to ${local}.`;
    await refresh();
  } catch (err) {
    $('archive-round-msg').textContent = err.message;
  }
});

$('jackpot-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('archive-round-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  const rollover = Number(f.get('rollover'));
  if(!Number.isFinite(rollover) || rollover < 0){ $('archive-round-msg').textContent='Enter a valid jackpot amount.'; return; }
  try {
    const r = await req(withTrack(API.jackpot), { method: 'PUT', body: JSON.stringify({ rollover, trackId: state.trackId }) });
    $('archive-round-msg').textContent = `Jackpot rollover set to $${Number(r.jackpotCarry || 0)} (${state.trackId}).`;
    const current = $('jackpot-current');
    if (current) current.textContent = `Current rollover: $${Number(r.jackpotCarry || 0)}`;
  } catch (err) {
    $('archive-round-msg').textContent = err.message;
  }
});

const resultsRace = $('results-race');
if (resultsRace) resultsRace.addEventListener('change', (e) => fillResultsForm(String(e.target.value || 'R1')));

$('results-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ $('results-msg').textContent='Admin login required.'; return; }
  const f = new FormData(e.target);
  const race = String(f.get('race') || '').toUpperCase();
  try {
    await req(withTrack(API.updateResult(race)), {
      method: 'PUT',
      body: JSON.stringify({
        first: String(f.get('first') || ''),
        second: String(f.get('second') || ''),
        third: String(f.get('third') || ''),
        substitutions: String(f.get('substitutions') || ''),
        trackId: state.trackId
      })
    });
    $('results-msg').textContent = 'Results saved.';
    await refresh();

    const raceSelect = $('results-race');
    if (raceSelect) {
      let next = '';
      for (let i = 1; i <= state.raceCount; i += 1) {
        const rKey = `R${i}`;
        if (!state.raceResults?.[rKey]) { next = rKey; break; }
      }
      raceSelect.value = next || race;
      fillResultsForm(raceSelect.value || race);
    } else {
      fillResultsForm(race);
    }
  } catch (err) {
    $('results-msg').textContent = err.message;
  }
});

$('bosses-extract-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  const fileInput = $('bosses-screenshot-file');
  const status = $('bosses-extract-status');
  const f = fileInput?.files?.[0];
  if(!f){ if(status) status.textContent = 'Choose a screenshot first.'; return; }
  if(status) status.textContent = 'Reading screenshot…';
  try {
    const form = new FormData();
    form.append('file', f);
    const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
    const r = await fetch(`/api/admin/extract-bosses-multi?trackId=${encodeURIComponent(state.trackId)}`, { method:'POST', headers, body: form, credentials:'same-origin' });
    const d = await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error || 'Extraction failed');
    state.bossesDraft = d;
    renderBossesDraft();
    if(status) status.textContent = d.verified ? 'Verified ✅' : 'Needs review ⚠️ Differences detected.';
  } catch (err) {
    if(status) status.textContent = err.message || 'Could not extract screenshot.';
    state.bossesDraft = null;
    renderBossesDraft();
  }
});

$('bosses-fill-form-btn')?.addEventListener('click', () => {
  fillBossesFormFromDraft();
});

$('bosses-copy-json-btn')?.addEventListener('click', async () => {
  const payload = state.bossesDraft?.mergedDraft;
  if(!payload) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    toastBosses('Draft JSON copied to clipboard.','ok');
  } catch {
    toastBosses('Could not copy draft JSON.','err');
  }
});

$('bosses-discard-draft-btn')?.addEventListener('click', () => {
  state.bossesDraft = null;
  renderBossesDraft();
  const status = $('bosses-extract-status');
  if(status) status.textContent = 'Draft discarded.';
});

$('bosses-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  const f = new FormData(e.target);

  const legItems = [];
  const rows = document.querySelectorAll('#bosses-legs-v2 .row');
  rows.forEach((_, idx) => {
    const race = String(f.get(`leg-race-${idx}`) || '').trim().toUpperCase();
    const selection = String(f.get(`leg-selection-${idx}`) || '').trim();
    if (!race) return;
    legItems.push({
      legNumber: idx + 1,
      race,
      selection,
      betType: String(f.get(`leg-type-${idx}`) || 'W/P').trim().toUpperCase(),
      odds: String(f.get(`leg-odds-${idx}`) || '').trim(),
      result: String(f.get(`leg-result-${idx}`) || 'PENDING').trim().toUpperCase()
    });
  });

  const legs = legItems.map((l) => l.race);
  const selections = {};
  legItems.forEach((l) => { selections[l.race] = l.selection; });

  const lockRaw = String(f.get('lockTime') || '').trim();
  const lockMs = lockRaw ? new Date(lockRaw).getTime() : null;

  try {
    await req(withTrack(API.bossesBet), {
      method: 'PUT',
      body: JSON.stringify({
        trackId: state.trackId,
        title: String(f.get('title') || 'Bosses Multi').trim(),
        weekKey: String(f.get('weekKey') || '').trim(),
        meet: String(f.get('meet') || '').trim(),
        status: String(f.get('status') || 'LIVE').trim().toLowerCase(),
        freerollPrize: Number(f.get('freerollPrize') || 0),
        eligibilityNote: String(f.get('eligibilityNote') || '').trim(),
        stake: String(f.get('stake') || '').trim(),
        potentialReturn: String(f.get('potentialReturn') || '').trim(),
        lockTime: Number.isFinite(lockMs) ? lockMs : null,
        legItems,
        legs,
        selections
      })
    });
    toastBosses('Bosses Multi saved.','ok');
    await refresh();
  } catch (err) {
    toastBosses(err.message || 'Could not save Bosses Multi.','err');
  }
});

$('bosses-add-leg-btn')?.addEventListener('click', () => {
  const nextIdx = (state.bossesBet.legItems || []).length + 1;
  state.bossesBet.legItems = [...(state.bossesBet.legItems || []), { legNumber: nextIdx, race: '', selection: '', betType: 'PLACE', odds: '', result: 'PENDING' }];
  renderBossesLegInputs();
});

$('bosses-mark-won-btn')?.addEventListener('click', () => {
  const status = $('bosses-status');
  if (status) status.value = 'WON';
  toastBosses('Status set to WON. Click Save / Update Bosses Multi.','warn');
});

$('bosses-mark-lost-btn')?.addEventListener('click', () => {
  const status = $('bosses-status');
  if (status) status.value = 'LOST';
  toastBosses('Status set to LOST. Click Save / Update Bosses Multi.','warn');
});

$('runners-parse-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  const race = $('runners-import-race')?.value || 'R1';
  const raceNumber = Number(String(race).replace('R','')) || 1;
  const text = String($('runners-import-text')?.value || '');
  const msg = $('runners-import-msg');
  if(!text.trim()){ if(msg) msg.textContent = 'Paste runner text first.'; return; }
  try {
    const r = await req(withTrack(API.raceRunnersParse), { method:'POST', body: JSON.stringify({ raceNumber, text, trackId: state.trackId }) });
    state.parsedRunners = r.runners || [];
    renderRunnersPreview();
    if (msg) msg.textContent = `Parsed ${state.parsedRunners.length} runner(s) with ${Number(r.warningsCount || 0)} warning(s).`;
  } catch (err) {
    if (msg) msg.textContent = err.message || 'Parse failed.';
  }
});

$('runners-save-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  const race = $('runners-import-race')?.value || 'R1';
  const source = String($('runners-import-source')?.value || 'manual-paste').trim() || 'manual-paste';
  const notes = String($('runners-import-notes')?.value || '').trim();
  const msg = $('runners-import-msg');
  if(!state.parsedRunners.length){ if(msg) msg.textContent = 'Parse runners before saving.'; return; }

  try {
    await req(withTrack(API.saveRaceRunners(race)), { method:'PUT', body: JSON.stringify({ trackId: state.trackId, source, notes, runners: state.parsedRunners, overwrite: false }) });
    if (msg) msg.textContent = `Saved ${state.parsedRunners.length} runner(s) into ${race}.`;
    const rs = await req(withTrack(API.raceRunners));
    state.raceRunners = rs.raceRunners || {};
  } catch (err) {
    if (String(err.message || '').toLowerCase().includes('already has imported runners')) {
      const yes = confirm(`${race} already has imported runners. Overwrite?`);
      if (!yes) return;
      try {
        await req(withTrack(API.saveRaceRunners(race)), { method:'PUT', body: JSON.stringify({ trackId: state.trackId, source, notes, runners: state.parsedRunners, overwrite: true }) });
        if (msg) msg.textContent = `Overwrote ${race} runners successfully.`;
      } catch (e2) { if (msg) msg.textContent = e2.message || 'Save failed.'; }
    } else {
      if (msg) msg.textContent = err.message || 'Save failed.';
    }
  }
});

$('runners-clear-btn')?.addEventListener('click', () => {
  state.parsedRunners = [];
  if ($('runners-import-text')) $('runners-import-text').value = '';
  if ($('runners-import-notes')) $('runners-import-notes').value = '';
  renderRunnersPreview();
  const msg = $('runners-import-msg');
  if (msg) msg.textContent = 'Importer cleared.';
});

$('clear-results-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('results-msg').textContent='Admin login required.'; return; }
  const race = String($('results-race')?.value || 'R1').toUpperCase();
  if(!confirm(`Clear saved result for ${race}?`)) return;
  try {
    await req(withTrack(API.clearResult(race)), { method: 'DELETE', body: JSON.stringify({ trackId: state.trackId }) });
    $('results-msg').textContent = `${race} result cleared.`;
    await refresh();
    fillResultsForm(race);
  } catch (err) {
    $('results-msg').textContent = err.message;
  }
});

$('autofill-bosses-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ $('bosses-msg').textContent='Admin login required.'; return; }

  try {
    // Always fetch latest tips before auto-fill so it works even if prior refresh failed.
    const p = await req(`${API.tips}?status=all&track=${encodeURIComponent(state.trackId)}`);
    state.tipsAll = p.tips || [];
    state.popularByRace = computePopularByRace(state.tipsAll);
    renderBossesSuggested(state.popularByRace);
  } catch (err) {
    toastBosses(`Could not load latest tips: ${err.message}`,'err');
    return;
  }

  const popular = state.popularByRace || {};
  const races = Object.keys(popular).sort((a,b)=>Number(String(a).replace('R',''))-Number(String(b).replace('R','')));
  state.bossesBet.legItems = races.map((race, idx) => ({
    legNumber: idx + 1,
    race,
    selection: String(popular[race]?.selection || ''),
    betType: 'PLACE',
    odds: '',
    result: 'PENDING'
  }));
  renderBossesLegInputs();

  const filled = state.bossesBet.legItems.length;
  toastBosses(
    filled
      ? `Auto-filled ${filled} race${filled===1?'':'s'} from most popular tips. Click Save / Update Bosses Multi to apply.`
      : 'No popular tips found to auto-fill yet.',
    filled ? 'ok' : 'warn'
  );
});

$('reset-bosses-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  if(!confirm('Reset Bosses Bet for all races?')) return;
  try {
    await req(withTrack(API.bossesBet), { method: 'DELETE', body: JSON.stringify({ trackId: state.trackId }) });
    toastBosses('Bosses Multi reset.','ok');
    await refresh();
  } catch (err) {
    toastBosses(err.message || 'Could not reset Bosses Multi.','err');
  }
});

$('reset-bosses-results-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ toastBosses('Admin login required.','warn'); return; }
  if(!confirm('Reset ALL Bosses Multi results and clear selections for this meet?')) return;
  try {
    // Primary reset endpoint
    await req(withTrack(API.bossesBetResults), { method: 'DELETE', body: JSON.stringify({ trackId: state.trackId }) });
    // Defensive follow-up to avoid stale selections from older deployments/caches
    await req(withTrack(API.bossesBet), { method: 'DELETE', body: JSON.stringify({ trackId: state.trackId }) });
    toastBosses('Bosses multi results and selections reset.','ok');
    await refresh();
  } catch (err) {
    toastBosses(err.message || 'Could not reset Bosses Multi results.','err');
  }
});

async function logout(){try{await req(API.logout,{method:'POST'});}catch{}state.token=null;state.user=null;localStorage.removeItem(tokenKey);await refresh();}

const trackSelect = $('punters-track-select');
if (trackSelect) {
  const qTrack = new URLSearchParams(window.location.search || '').get('track');
  if (qTrack) state.trackId = qTrack;
  localStorage.setItem(trackKey, state.trackId);
  trackSelect.value = state.trackId;
  updateTrackLabels();
  trackSelect.addEventListener('change', async () => {
    state.trackId = String(trackSelect.value || 'thoroughbreds');
    localStorage.setItem(trackKey, state.trackId);
    updateTrackLabels();
    await refresh();
  });
}

setRoundWinnerFormDisabled(true);
(async()=>{await bootstrap();await refresh();refreshPokerPlayerOptions().catch(()=>{});})();

setInterval(() => {
  if (document.hidden) return;
  if (!isAdmin()) return;
  refresh().catch(() => {});
}, 30000);


const pokerEventPreset = $('poker-event-preset');

function syncPokerEventMode() {}
function syncPokerPlayerMode() {}

function selectedPokerPlayer(formData) {
  return String(formData.get('playerSelect') || '').trim();
}

function renderPokerPlayerOptions(players = []) {
  const select = $('poker-player-select');
  if (!select) return;
  const current = String(select.value || '');
  const options = ['<option value="">Select player…</option>'];
  (players || []).forEach((name) => {
    const safe = String(name || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    options.push(`<option value="${safe}">${safe}</option>`);
  });
  select.innerHTML = options.join('');

  if (current && Array.from(select.options).some((o) => o.value === current)) {
    select.value = current;
  } else {
    select.value = '';
  }
  syncPokerPlayerMode();
}

async function refreshPokerPlayerOptions() {
  try {
    const out = await req(API.pokerPlayers);
    renderPokerPlayerOptions(out.players || []);
  } catch {
    renderPokerPlayerOptions([]);
  }
}

function parseCsvUsernames(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const parseCells = (line) => line.split(',').map((c) => String(c || '').trim().replace(/^"|"$/g, ''));

  // Accept one-line comma-separated username lists:
  // user1,user2,user3,...
  if (lines.length === 1) {
    const single = parseCells(lines[0]).filter(Boolean);
    const looksLikeHeaderOnly = single.length <= 3 && single.every((v) => ['username', 'player', 'name'].includes(v.toLowerCase()));
    if (single.length > 1 && !looksLikeHeaderOnly) {
      const seen = new Set();
      return single.filter((n) => {
        const key = n.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  const header = parseCells(lines[0]).map((h) => h.toLowerCase());
  const preferred = ['username', 'player', 'name'];
  let idx = header.findIndex((h) => preferred.includes(h));

  const out = [];
  const start = idx >= 0 ? 1 : 0;
  if (idx < 0) idx = 0;

  for (let i = start; i < lines.length; i += 1) {
    const cells = parseCells(lines[i]);
    const name = String(cells[idx] || '').trim();
    if (!name) continue;
    out.push(name);
  }

  const seen = new Set();
  return out.filter((n) => {
    const key = n.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyPokerBulkFromQuery(){
  const box = $('poker-bulk-lines');
  if (!box) return;
  const params = new URLSearchParams(window.location.search || '');
  const bulkLines = params.get('bulkLines');
  if (!bulkLines) return;

  box.value = bulkLines;

  const eventName = String(params.get('eventName') || '').trim();
  if (eventName) {
    const preset = $('poker-event-preset');
    const known = ['Nightly 500gtd', 'Nightly 700gtd', 'Sunday 1300gtd'];
    if (preset) {
      if (known.includes(eventName)) preset.value = eventName;
      syncPokerEventMode();
    }
  }

  setPokerResultMsg('warn', 'Bulk lines prefilled from URL. Review and click Import Bulk Results.');
}

pokerEventPreset?.addEventListener('change', syncPokerEventMode);
$('poker-player-select')?.addEventListener('change', syncPokerPlayerMode);
syncPokerEventMode();
syncPokerPlayerMode();
applyPokerBulkFromQuery();

function selectedPokerEventName(formData){
  const eventName = String(formData.get('eventPreset') || 'Nightly 500gtd').trim();
  return { eventName };
}

$('poker-result-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }
  const f = new FormData(e.target);
  const player = String(selectedPokerPlayer(f) || '').trim();
  const points = Number(f.get('points'));
  const { eventName } = selectedPokerEventName(f);
  const finalTable = f.get('finalTable') !== null;
  const cashed = f.get('cashed') !== null;

  if (!player) { setPokerResultMsg('err','Player is required.'); return; }
  if (!Number.isFinite(points) || points < 0) { setPokerResultMsg('err','Enter a valid points value.'); return; }
  // Manual event entry removed: event comes from preset only.

  try {
    await req(API.pokerResults, {
      method: 'POST',
      body: JSON.stringify({ player, points, finalTable, cashed, eventName, createdAt: Date.now() })
    });

    let top='';
    let tail='';
    try {
      const lbWeek = await req(`${API.pokerLeaderboard}?range=week`);
      const first = (lbWeek.leaderboard || [])[0];
      if (first) top = ` Top this week: ${first.player} (${Number(first.points||0).toFixed(2).replace(/\.00$/,'')}).`;
    } catch {}
    try {
      const lbAll = await req(`${API.pokerLeaderboard}?range=all`);
      tail = ` All-time events now: ${Number(lbAll?.stats?.events || 0)}.`;
    } catch {}

    setPokerResultMsg('ok', `Single import successful: added 1 result for ${player} (${eventName || 'event not set'}).${tail}${top}`);
    e.target.reset();
    syncPokerEventMode();
    syncPokerPlayerMode();
    refreshPokerPlayerOptions().catch(()=>{});
  } catch (err) {
    setPokerResultMsg('err', `Single import failed: ${err.message || 'Request failed.'}`);
  }
});

function parsePokerBulkRows(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  // Primary mode: one row per line (or semicolon-separated)
  let rows = text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(',').map((x) => x.trim());
      return { player: String(parts[0] || ''), points: Number(parts[1]), rank: Number(parts[2]), raw: line };
    })
    .filter((r) => r.player || Number.isFinite(r.points));

  // Fallback mode: single-line triples separated by spaces, e.g.
  // "MILLLZZ,814.05,1 OneLook,488.43,2 AllinSam,325.62,3"
  if (rows.length <= 1) {
    const matches = [...text.matchAll(/([^,\n;]+?),\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+))?/g)];
    if (matches.length >= 2) {
      rows = matches.map((m) => ({
        player: String(m[1] || '').trim(),
        points: Number(m[2]),
        rank: Number(m[3]),
        raw: m[0]
      }));
    }
  }

  return rows;
}

async function submitPokerResultsBatch(results, errors = [], prefix = 'Bulk import successful') {
  if (!results.length) { setPokerResultMsg('err', errors[0] || 'No valid rows to import.'); return; }
  try {
    const out = await req(API.pokerResults, { method: 'POST', body: JSON.stringify({ results }) });
    let tail = '';
    try {
      const lb = await req(`${API.pokerLeaderboard}?range=all`);
      tail = ` All-time events now: ${Number(lb?.stats?.events || 0)}.`;
    } catch {}
    const successCount = Number(out?.added || results.length);
    const failCount = errors.length;
    const failedPreview = failCount ? ` Failed lines: ${errors.slice(0, 3).join(' | ')}${failCount > 3 ? ' ...' : ''}` : '';
    const summary = `${prefix}: ${successCount} added.${failCount ? ` Failed/skipped: ${failCount}.` : ' Failed/skipped: 0.'}${tail}${failedPreview}`;
    setPokerResultMsg(failCount ? 'warn' : 'ok', summary);
    refreshPokerPlayerOptions().catch(()=>{});
  } catch (err) {
    setPokerResultMsg('err', err.message || 'Request failed.');
  }
}

$('poker-bulk-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }

  const formData = new FormData(e.target);
  const raw = String(formData.get('bulkLines') || '');
  const rows = parsePokerBulkRows(raw);
  const parentFormData = new FormData($('poker-result-form'));
  const { eventName } = selectedPokerEventName(parentFormData);
  const finalTableDefault = parentFormData.get('finalTable') !== null;
  const cashedDefault = parentFormData.get('cashed') !== null;

  if (!rows.length) { setPokerResultMsg('err', 'Paste at least one valid row.'); return; }
  // Manual event entry removed: event comes from preset only.

  const results = [];
  const errors = [];
  rows.forEach((row, idx) => {
    const player = String(row.player || '').trim();
    const points = Number(row.points);
    const rank = Number(row.rank);
    if (!player || !Number.isFinite(points) || points < 0) {
      errors.push(`Line ${idx + 1} invalid: ${row.raw}`);
      return;
    }
    results.push({
      player,
      points,
      finalTable: finalTableDefault,
      cashed: cashedDefault,
      eventName,
      createdAt: Date.now(),
      ...(Number.isFinite(rank) && rank > 0 ? { eventRank: rank } : {})
    });
  });

  await submitPokerResultsBatch(results, errors, 'Bulk import successful');
});

$('poker-result-clear-btn')?.addEventListener('click', () => {
  const f = $('poker-result-form');
  if (f) f.reset();
  syncPokerEventMode();
  syncPokerPlayerMode();
  const msg = $('poker-result-msg');
  if (msg) { msg.textContent = ''; msg.classList.remove('msg-ok','msg-warn','msg-err'); }
});

$('poker-bulk-clear-btn')?.addEventListener('click', () => {
  const box = $('poker-bulk-lines');
  if (box) box.value = '';
  const msg = $('poker-result-msg');
  if (msg) { msg.textContent = ''; msg.classList.remove('msg-ok','msg-warn','msg-err'); }
});

$('poker-xlsx-import-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }
  if (typeof XLSX === 'undefined') { setPokerResultMsg('err', 'XLSX parser not loaded.'); return; }

  const source = String($('poker-xlsx-source')?.value || '').trim();
  if (!source) { setPokerResultMsg('err', 'Select an XLSX source.'); return; }

  const parentFormData = new FormData($('poker-result-form'));
  const { eventName } = selectedPokerEventName(parentFormData);
  const finalTableDefault = parentFormData.get('finalTable') !== null;
  const cashedDefault = parentFormData.get('cashed') !== null;
  // Manual event entry removed: event comes from preset only.

  try {
    const resp = await fetch(source, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`Could not fetch XLSX (${resp.status})`);
    const ab = await resp.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const results = [];
    const errors = [];
    rows.forEach((row, idx) => {
      const player = String(row.player || row.Player || row.username || row.Username || row.name || row.Name || '').trim();
      const pointsRaw = row.points ?? row.Points ?? row.score ?? row.Score ?? row.total ?? row.Total;
      const points = Number(pointsRaw);
      const rankRaw = row.rank ?? row.Rank ?? row.eventRank ?? row.Position ?? row.position;
      const rank = Number(rankRaw);
      if (!player || !Number.isFinite(points) || points < 0) {
        errors.push(`Row ${idx + 2} invalid`);
        return;
      }
      results.push({
        player,
        points,
        finalTable: finalTableDefault,
        cashed: cashedDefault,
        eventName,
        createdAt: Date.now(),
        ...(Number.isFinite(rank) && rank > 0 ? { eventRank: rank } : {})
      });
    });

    await submitPokerResultsBatch(results, errors, `XLSX import successful (${source.split('/').pop()})`);
  } catch (err) {
    setPokerResultMsg('err', err.message || 'XLSX import failed.');
  }
});

$('clear-poker-records-btn')?.addEventListener('click', async () => {
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }
  const typed = prompt('This will permanently delete ALL Poker V2 results. Type CLEAR to confirm.');
  if (typed !== 'CLEAR') { setPokerResultMsg('warn', 'Cancelled: confirmation text did not match.'); return; }
  try {
    const out = await req('/poker/results', { method:'DELETE', body: JSON.stringify({ confirm: 'CLEAR' }) });
    setPokerResultMsg('ok', `Poker records cleared. Removed ${Number(out?.removed || 0)} rows.`);
    await refresh();
  } catch (err) {
    setPokerResultMsg('err', err.message || 'Could not clear poker records.');
  }
});

$('poker-players-import-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if(!isAdmin()){ setPokerResultMsg('err','Admin login required.'); return; }

  const textBox = $('poker-players-csv-text');
  const fileInput = $('poker-players-csv-file');
  let csvText = String(textBox?.value || '').trim();

  if (!csvText && fileInput?.files?.[0]) {
    try {
      csvText = await fileInput.files[0].text();
    } catch {
      setPokerResultMsg('err','Could not read CSV file.');
      return;
    }
  }

  const names = parseCsvUsernames(csvText);
  if (!names.length) {
    setPokerResultMsg('err','No usernames found in CSV. Include username/player/name column or first column of names.');
    return;
  }

  try {
    const out = await req(API.pokerPlayersImport, { method: 'POST', body: JSON.stringify({ names }) });
    await refreshPokerPlayerOptions();
    setPokerResultMsg('ok', `Imported ${Number(out?.added || 0)} usernames. Player autofill list now has ${Number(out?.total || 0)} names.`);
  } catch (err) {
    setPokerResultMsg('err', err.message || 'Username import failed.');
  }
});

$('poker-players-import-clear-btn')?.addEventListener('click', () => {
  const t = $('poker-players-csv-text');
  const f = $('poker-players-csv-file');
  if (t) t.value = '';
  if (f) f.value = '';
});
