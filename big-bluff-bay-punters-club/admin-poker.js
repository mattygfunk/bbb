(()=>{
  const app=document.getElementById('admin-app');
  const route=location.pathname;
  const token=localStorage.getItem('bbb-token-v3')||'';
  const headers={ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})};
  const esc=(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{...headers,...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d;}
  const submitToken=()=>`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function parseCsv(text){
    return String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map((line)=>{const p=line.split(',');return {player:p[0],points:Number(p[1]),eventName:p[2]||''};});
  }

  async function overview(){
    const [seasons,insights,audit]=await Promise.all([
      api('/api/poker/seasons'),
      api('/api/poker/admin/insights').catch(()=>({provider:'mock',recap:'Login as admin to see insights',bullets:[]})),
      api('/api/poker/admin/audit?pageSize=8').catch(()=>({rows:[]}))
    ]);
    app.innerHTML=`<section class='pv2-card'><h2>Admin Poker Panel</h2><p class='muted'>AI Insights provider: ${esc(insights.provider||'mock')}</p><p>${esc(insights.recap||'')}</p><ul>${(insights.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul></section>
    <section class='pv2-card'><h3>Seasons</h3><div class='table-wrap'><table><thead><tr><th>Name</th><th>Window</th><th>Active</th><th>Action</th></tr></thead><tbody>
    ${(seasons.seasons||[]).map(s=>`<tr><td>${esc(s.name)}</td><td>${new Date(s.startAt).toLocaleDateString('en-AU')} - ${s.endAt?new Date(s.endAt).toLocaleDateString('en-AU'):'Open'}</td><td>${s.isActive?'✅':'—'}</td><td><button class='btn activate' data-id='${s.id}'>Set active</button></td></tr>`).join('')}
    </tbody></table></div></section>
    <section class='pv2-card'><h3>Audit Log</h3><div class='table-wrap'><table><thead><tr><th>Time</th><th>Action</th><th>Actor</th></tr></thead><tbody>${(audit.rows||[]).map(r=>`<tr><td>${new Date(r.createdAt).toLocaleString('en-AU')}</td><td>${esc(r.action)}</td><td>${esc(r.actor)}</td></tr>`).join('')}</tbody></table></div></section>`;
    document.querySelectorAll('.activate').forEach(b=>b.onclick=async()=>{await api(`/api/poker/seasons/${b.dataset.id}/activate`,{method:'PUT'});location.reload();});
  }

  async function results(){
    const events=await api('/api/poker/events');
    app.innerHTML=`<section class='pv2-card'><h2>Results Import</h2>
    <form id='smart'><label>Event
      <select id='event'>${(events.events||[]).map(e=>`<option value='${e.id}'>${esc(e.name)}</option>`).join('')}<option value='custom'>Custom event…</option></select>
    </label>
    <label id='customWrap' hidden>Custom event <input id='customEvent' /></label>
    <label>Screenshot ref placeholder <input id='shot' placeholder='uploads/nightly-2026-02-16.png' /></label>
    <label>Smart paste<textarea id='paste' rows='8' placeholder='rank player points OR player - points - event'></textarea></label>
    <div class='row-actions'><button class='btn' type='button' id='preview'>Preview</button><button class='btn' type='button' id='save'>Save Import</button></div>
    </form><div id='previewBox'></div></section>
    <section class='pv2-card'><h3>CSV import</h3><textarea id='csv' rows='4' placeholder='player,points,event'></textarea><button class='btn' id='csvSave'>Import CSV</button></section>
    <section class='pv2-card'><h3>Quick mode</h3><button class='btn' id='addAnother'>Add another result mode</button><p id='msg' class='muted'></p></section>`;

    const eventEl=document.getElementById('event');
    const customWrap=document.getElementById('customWrap');
    eventEl.onchange=()=>customWrap.hidden=eventEl.value!=='custom';

    async function previewRows(){
      const defaultEventName=eventEl.value==='custom'?document.getElementById('customEvent').value:'';
      const p=await api('/api/poker/results/preview',{method:'POST',body:JSON.stringify({smartPaste:document.getElementById('paste').value,defaultEventName,screenshotRef:document.getElementById('shot').value})});
      const rows=(p.rows||[]).map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.player)}</td><td>${esc(r.points||'')}</td><td>${esc(r.eventName||'')}</td><td>${(r.duplicateWarning||[]).map(x=>esc(x.displayName)).join(', ')||'—'}</td></tr>`).join('');
      document.getElementById('previewBox').innerHTML=`<div class='table-wrap'><table><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Event</th><th>Duplicate warning</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      return p.rows||[];
    }

    let cached=[];
    document.getElementById('preview').onclick=async()=>{cached=await previewRows();};
    document.getElementById('save').onclick=async()=>{
      if(!cached.length) cached=await previewRows();
      const defaultEventName=eventEl.value==='custom'?document.getElementById('customEvent').value:((events.events||[]).find(e=>e.id===eventEl.value)||{}).name;
      const eventId=eventEl.value==='custom'?null:eventEl.value;
      const results=cached.map(r=>({...r,eventId,eventName:r.eventName||defaultEventName,finalTable:true,cashed:true,screenshotRef:document.getElementById('shot').value}));
      await api('/api/poker/results',{method:'POST',body:JSON.stringify({submitToken:submitToken(),results})});
      document.getElementById('msg').textContent='Imported successfully. Official result tagged with admin + timestamp.';
    };

    document.getElementById('csvSave').onclick=async()=>{
      const rows=parseCsv(document.getElementById('csv').value).filter(r=>r.player&&Number.isFinite(r.points));
      await api('/api/poker/results',{method:'POST',body:JSON.stringify({submitToken:submitToken(),results:rows.map(r=>({...r,eventId:eventEl.value==='custom'?null:eventEl.value,eventName:r.eventName||((events.events||[]).find(e=>e.id===eventEl.value)||{}).name,finalTable:false,cashed:false}))})});
      document.getElementById('msg').textContent='CSV import complete';
    };

    document.getElementById('addAnother').onclick=()=>{document.getElementById('paste').value='';document.getElementById('paste').focus();document.getElementById('msg').textContent='Quick mode ready: paste next result batch.';};
  }

  async function players(){
    const d=await api('/api/poker/players');
    app.innerHTML=`<section class='pv2-card'><h2>Players</h2><div class='table-wrap'><table><thead><tr><th>Name</th><th>Canonical</th><th>Merge</th></tr></thead><tbody>${(d.players||[]).map(p=>`<tr><td>${esc(p.displayName)}</td><td>${esc(p.canonicalName)}</td><td><button class='btn merge' data-id='${p.id}' data-name='${esc(p.displayName)}'>Merge into…</button></td></tr>`).join('')}</tbody></table></div></section>`;
    document.querySelectorAll('.merge').forEach(b=>b.onclick=async()=>{
      const primary=prompt('Primary player ID',b.dataset.id);if(!primary)return;
      const dups=prompt('Duplicate IDs (comma separated)');if(!dups)return;
      await api('/api/poker/players/merge',{method:'POST',body:JSON.stringify({primaryId:primary,duplicateIds:dups.split(',').map(x=>x.trim()).filter(Boolean)})});
      alert('Merge complete');location.reload();
    });
  }

  async function events(){
    const d=await api('/api/poker/events');
    app.innerHTML=`<section class='pv2-card'><h2>Events</h2><div class='table-wrap'><table><thead><tr><th>Name</th><th>Type</th><th>Start</th></tr></thead><tbody>${(d.events||[]).map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.type)}</td><td>${new Date(e.startAt).toLocaleString('en-AU')}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  if(route==='/admin/poker')overview();
  else if(route==='/admin/poker/results')results();
  else if(route==='/admin/poker/players')players();
  else if(route==='/admin/poker/events')events();
})();
