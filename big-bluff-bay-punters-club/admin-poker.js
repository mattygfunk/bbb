(()=>{
  const app=document.getElementById('admin-app');
  const route=location.pathname;
  const token=localStorage.getItem('bbb-token-v3')||'';
  const headers={ 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})};
  const esc=(s)=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

  async function api(url,opt={}){
    const r=await fetch(url,{...opt,headers:{...headers,...(opt.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||'Request failed');
    return d;
  }
  const submitToken=()=>`sub-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function parseCsv(text){
    return String(text||'')
      .split(/\r?\n/)
      .map(l=>l.trim())
      .filter(Boolean)
      .map((line)=>{
        const p=line.split(',').map(x=>x.trim());
        return {player:p[0],points:Number(p[1]),eventName:p[2]||''};
      });
  }

  function setMessage(kind,msg){
    const el=document.getElementById('msg');
    if(!el) return;
    el.className=`pv2-alert ${kind||'info'}`;
    el.textContent=msg||'';
  }

  async function overview(){
    const [seasons,insights,audit]=await Promise.all([
      api('/api/poker/seasons'),
      api('/api/poker/admin/insights').catch(()=>({provider:'mock',recap:'Login as admin to see insights',bullets:[]})),
      api('/api/poker/admin/audit?pageSize=10').catch(()=>({rows:[]}))
    ]);

    app.innerHTML=`
      <section class='pv2-card'>
        <h2>Admin Poker Panel</h2>
        <p class='muted'>AI Insights provider: ${esc(insights.provider||'mock')}</p>
        <p>${esc(insights.recap||'')}</p>
        <ul>${(insights.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join('')}</ul>
      </section>
      <section class='pv2-card'>
        <h3>Seasons</h3>
        <div class='table-wrap'>
          <table>
            <thead><tr><th>Name</th><th>Window</th><th>Active</th><th>Action</th></tr></thead>
            <tbody>
              ${(seasons.seasons||[]).map(s=>`<tr>
                <td>${esc(s.name)}</td>
                <td>${new Date(s.startAt).toLocaleDateString('en-AU')} - ${s.endAt?new Date(s.endAt).toLocaleDateString('en-AU'):'Open'}</td>
                <td>${s.isActive?'<span class="pill">Active</span>':'—'}</td>
                <td><button class='btn activate' data-id='${s.id}'>Set active</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>
      <section class='pv2-card'>
        <h3>Audit Log</h3>
        <div class='table-wrap'>
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Actor</th></tr></thead>
            <tbody>${(audit.rows||[]).map(r=>`<tr><td>${new Date(r.createdAt).toLocaleString('en-AU')}</td><td>${esc(r.action)}</td><td>${esc(r.actor)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;

    document.querySelectorAll('.activate').forEach(b=>b.onclick=async()=>{
      b.disabled=true;
      try{ await api(`/api/poker/seasons/${b.dataset.id}/activate`,{method:'PUT'}); location.reload(); }
      catch(err){ alert(err.message||'Failed'); b.disabled=false; }
    });
  }

  async function results(){
    const events=await api('/api/poker/events');
    const eventOptions=(events.events||[]).map(e=>`<option value='${e.id}'>${esc(e.name)}</option>`).join('');

    app.innerHTML=`
      <section class='pv2-card'>
        <h2>Results Import</h2>
        <p class='muted'>Paste any rough text and preview before save. Official entries are tagged with admin + timestamp.</p>
        <form id='smart' class='pv2-form-grid' onsubmit='return false'>
          <label>Event
            <select id='event'>${eventOptions}<option value='custom'>Custom event…</option></select>
          </label>
          <label id='customWrap' hidden>Custom event <input id='customEvent' placeholder='eg Tuesday Deepstack' /></label>
          <label>Screenshot reference (optional) <input id='shot' placeholder='uploads/nightly-2026-02-16.png' /></label>
          <label>Smart paste
            <textarea id='paste' rows='8' placeholder='Examples:\n1 FloppinQuads 123.4\nPlayerName - 55 - Sunday 1300gtd\nAnotherPlayer 22.5'></textarea>
          </label>

          <div class='row-actions'>
            <label><input id='defaultFT' type='checkbox' /> Default FT</label>
            <label><input id='defaultCash' type='checkbox' /> Default Cash</label>
            <label><input id='quickMode' type='checkbox' checked /> Add another after save</label>
          </div>

          <div class='row-actions'>
            <button class='btn' type='button' id='preview'>Preview</button>
            <button class='btn btn-primary' type='button' id='save'>Save Import</button>
            <button class='btn' type='button' id='clear'>Clear</button>
          </div>
        </form>
        <div id='msg' class='pv2-alert info'>Ready.</div>
        <div id='previewBox'></div>
      </section>

      <section class='pv2-card'>
        <h3>CSV import</h3>
        <p class='muted'>Format: <code>player,points,event(optional)</code> one per line.</p>
        <textarea id='csv' rows='4' placeholder='FloppinQuads,123.4,Sunday 1300gtd'></textarea>
        <div class='row-actions'>
          <button class='btn' id='csvValidate'>Validate CSV</button>
          <button class='btn btn-primary' id='csvSave'>Import CSV</button>
        </div>
        <div id='csvMsg' class='muted'></div>
      </section>`;

    const eventEl=document.getElementById('event');
    const customWrap=document.getElementById('customWrap');
    const customEventEl=document.getElementById('customEvent');
    const previewBtn=document.getElementById('preview');
    const saveBtn=document.getElementById('save');
    const clearBtn=document.getElementById('clear');

    const csvValidateBtn=document.getElementById('csvValidate');
    const csvSaveBtn=document.getElementById('csvSave');

    eventEl.onchange=()=>customWrap.hidden=eventEl.value!=='custom';

    let cached=[];

    function validateEvent(){
      if(eventEl.value!=='custom') return {ok:true,eventId:eventEl.value,eventName:(events.events||[]).find(e=>e.id===eventEl.value)?.name||''};
      const name=String(customEventEl.value||'').trim();
      if(!name) return {ok:false,error:'Custom event required when Event = Custom.'};
      return {ok:true,eventId:null,eventName:name};
    }

    function renderPreview(rows){
      const validRows=rows.filter(r=>r.points!==null && r.points!==undefined && r.points!=='' && Number.isFinite(Number(r.points)) && String(r.player||'').trim());
      const invalidCount=rows.length-validRows.length;
      const tableRows=rows.map((r,i)=>{
        const warnings=(r.duplicateWarning||[])
          .map(x=>`<span class='pill warn' title='distance ${x.score}'>${esc(x.displayName)}</span>`)
          .join(' ');
        const bad=(!r.points || Number.isNaN(Number(r.points)) || !String(r.player||'').trim());
        return `<tr class='${bad?'row-bad':''}'>
          <td>${i+1}</td>
          <td>${esc(r.player||'')}</td>
          <td>${esc(r.points||'')}</td>
          <td>${esc(r.eventName||'')}</td>
          <td>${warnings||'—'}</td>
        </tr>`;
      }).join('');

      document.getElementById('previewBox').innerHTML=`
        <p class='muted'>Parsed ${rows.length} row(s) • Valid ${validRows.length} • Invalid ${invalidCount}</p>
        <div class='table-wrap'>
          <table>
            <thead><tr><th>#</th><th>Player</th><th>Points</th><th>Event</th><th>Duplicate warning</th></tr></thead>
            <tbody>${tableRows||'<tr><td colspan=5>No rows parsed</td></tr>'}</tbody>
          </table>
        </div>`;

      return validRows;
    }

    async function previewRows(){
      const ev=validateEvent();
      if(!ev.ok){ setMessage('error',ev.error); return []; }

      setMessage('info','Parsing…');
      previewBtn.disabled=true;
      try{
        const p=await api('/api/poker/results/preview',{
          method:'POST',
          body:JSON.stringify({
            smartPaste:document.getElementById('paste').value,
            defaultEventName:ev.eventName,
            screenshotRef:document.getElementById('shot').value
          })
        });
        const rows=p.rows||[];
        const validRows=renderPreview(rows);
        cached=rows;
        setMessage(validRows.length?'success':'warn', validRows.length?`Preview ready: ${validRows.length} valid row(s).`:'No valid rows found in paste.');
        return validRows;
      }catch(err){
        setMessage('error',err.message||'Preview failed');
        return [];
      }finally{ previewBtn.disabled=false; }
    }

    previewBtn.onclick=async()=>{ await previewRows(); };

    saveBtn.onclick=async()=>{
      const ev=validateEvent();
      if(!ev.ok){ setMessage('error',ev.error); return; }

      if(!cached.length) await previewRows();
      const validRows=renderPreview(cached);
      if(!validRows.length){ setMessage('error','Nothing valid to import.'); return; }

      const finalTable=document.getElementById('defaultFT').checked;
      const cashed=document.getElementById('defaultCash').checked;
      const screenshotRef=document.getElementById('shot').value;

      saveBtn.disabled=true;
      try{
        await api('/api/poker/results',{
          method:'POST',
          body:JSON.stringify({
            submitToken:submitToken(),
            results:validRows.map(r=>({
              ...r,
              eventId:ev.eventId,
              eventName:r.eventName||ev.eventName,
              finalTable,
              cashed,
              screenshotRef
            }))
          })
        });

        setMessage('success',`Imported ${validRows.length} result(s) successfully.`);
        if(document.getElementById('quickMode').checked){
          document.getElementById('paste').value='';
          document.getElementById('paste').focus();
          cached=[];
          document.getElementById('previewBox').innerHTML='';
        }
      }catch(err){
        setMessage('error',err.message||'Import failed');
      }finally{ saveBtn.disabled=false; }
    };

    clearBtn.onclick=()=>{
      document.getElementById('paste').value='';
      document.getElementById('shot').value='';
      document.getElementById('previewBox').innerHTML='';
      cached=[];
      setMessage('info','Cleared.');
    };

    function validateCsvRows(){
      const rows=parseCsv(document.getElementById('csv').value);
      const valid=rows.filter(r=>String(r.player||'').trim() && Number.isFinite(r.points));
      const invalid=rows.length-valid.length;
      document.getElementById('csvMsg').textContent=`Rows: ${rows.length}. Valid: ${valid.length}. Invalid: ${invalid}.`;
      return {rows,valid,invalid};
    }

    csvValidateBtn.onclick=()=>{
      const {valid,invalid}=validateCsvRows();
      if(!valid.length) setMessage('warn','CSV has no valid rows yet.');
      else if(invalid) setMessage('warn',`CSV has ${invalid} invalid row(s) that will be skipped.`);
      else setMessage('success','CSV looks good.');
    };

    csvSaveBtn.onclick=async()=>{
      const ev=validateEvent();
      if(!ev.ok){ setMessage('error',ev.error); return; }

      const {valid}=validateCsvRows();
      if(!valid.length){ setMessage('error','No valid CSV rows to import.'); return; }

      csvSaveBtn.disabled=true;
      try{
        await api('/api/poker/results',{
          method:'POST',
          body:JSON.stringify({
            submitToken:submitToken(),
            results:valid.map(r=>({
              ...r,
              eventId:ev.eventId,
              eventName:r.eventName||ev.eventName,
              finalTable:false,
              cashed:false
            }))
          })
        });
        setMessage('success',`CSV import complete: ${valid.length} row(s).`);
      }catch(err){
        setMessage('error',err.message||'CSV import failed');
      }finally{ csvSaveBtn.disabled=false; }
    };
  }

  async function players(){
    const d=await api('/api/poker/players');
    const players=(d.players||[]);

    app.innerHTML=`
      <section class='pv2-card'>
        <h2>Players</h2>
        <p class='muted'>Merge duplicates safely by selecting one primary and one+ duplicates.</p>

        <div class='pv2-form-grid'>
          <label>Search <input id='playerSearch' placeholder='Find player' /></label>
          <label>Primary
            <select id='primarySelect'>${players.map(p=>`<option value='${p.id}'>${esc(p.displayName)}</option>`).join('')}</select>
          </label>
        </div>

        <div class='table-wrap'>
          <table>
            <thead><tr><th>Merge?</th><th>Name</th><th>Canonical</th></tr></thead>
            <tbody id='playerRows'>${players.map(p=>`<tr data-name='${esc((p.displayName||'').toLowerCase())}'>
              <td><input type='checkbox' class='dupCheck' value='${p.id}' /></td>
              <td>${esc(p.displayName)}</td>
              <td><span class='pill'>${esc(p.canonicalName)}</span></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>

        <div class='row-actions'>
          <button class='btn btn-primary' id='runMerge'>Merge Selected into Primary</button>
        </div>
        <div id='msg' class='pv2-alert info'>Select duplicates then merge.</div>
      </section>`;

    const searchEl=document.getElementById('playerSearch');
    searchEl.oninput=()=>{
      const q=String(searchEl.value||'').trim().toLowerCase();
      document.querySelectorAll('#playerRows tr').forEach(tr=>{
        tr.style.display=!q||tr.dataset.name.includes(q)?'':'none';
      });
    };

    document.getElementById('runMerge').onclick=async()=>{
      const primaryId=document.getElementById('primarySelect').value;
      const duplicateIds=[...document.querySelectorAll('.dupCheck:checked')].map(x=>x.value).filter(Boolean).filter(id=>id!==primaryId);
      if(!primaryId){ setMessage('error','Choose a primary player.'); return; }
      if(!duplicateIds.length){ setMessage('warn','Select at least one duplicate to merge.'); return; }
      try{
        await api('/api/poker/players/merge',{method:'POST',body:JSON.stringify({primaryId,duplicateIds})});
        setMessage('success',`Merged ${duplicateIds.length} duplicate(s). Reloading…`);
        setTimeout(()=>location.reload(),700);
      }catch(err){
        setMessage('error',err.message||'Merge failed');
      }
    };
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
