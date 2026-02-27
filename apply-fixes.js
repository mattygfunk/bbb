const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'afl-tipping.html',
  'afl-tipping-rules.html',
  'afl-tipping-submit.html',
  'afl-tipping-leaderboard.html',
  'afl-tipping.js',
  'afl-tipping-leaderboard.js',
  'afl-tipping-system.js'
];

const basePath = path.join(__dirname, '..', 'big-bluff-bay-punters-club');

filesToUpdate.forEach(file => {
  const filePath = path.join(basePath, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update entry fee
    content = content.replace(/\$75/g, '$100');
    
    // Update prize structure display
    content = content.replace(/Prize pool = \(entrants × \$75\) × 80%/g, 'Prize pool based on $100 entry fee. See rules for full breakdown.');
    content = content.replace(/1st Place \(40%\)/g, '1st Place (50%)');
    content = content.replace(/2nd Place \(25%\)/g, '2nd Place (30%)');
    content = content.replace(/3rd Place \(15%\)/g, '3rd Place (20%)');

    // Update KO UI
    if (file === 'afl-tipping.html') {
        content = content.replace(/<section class="card" style="margin-bottom:1.5rem;border-color:#ef4444;" id="ko-section">[\s\S]*?<\/section>/, `
        <!-- KO Competition section -->
        <section class="card" style="margin-bottom:1.5rem;border-color:#ef4444;" id="ko-section-wrapper">
          <h2 style="margin:0 0 1rem;color:#ef4444;">🥊 Knockout Competitions</h2>
          <div class="split" id="ko-competitions-container" style="gap:1rem;">
            <!-- KO cards will be rendered here by JS -->
          </div>
        </section>
        `);
    }

    if (file === 'afl-tipping.js') {
        content = content.replace(/function renderKnockout\(knockoutData\) {[\s\S]*?}/, `
  function renderKnockout(knockoutData, prizes) {
    const container = document.getElementById('ko-competitions-container');
    if (!container || !Array.isArray(knockoutData)) return;

    const koPrizeEach = prizes?.knockoutEach || 0;

    container.innerHTML = knockoutData.map(ko => {
      const activePlayers = ko.activePlayers || [];
      const eliminatedCount = ko.totalEliminated || 0;
      const winner = ko.winner;
      
      let activeNamesHTML = '';
      if (activePlayers.length === 0) {
        activeNamesHTML = 'Competition over';
      } else if (activePlayers.length <= 4) {
        activeNamesHTML = activePlayers.map(p => \`<span style="color:#4ade80;font-weight:600;">\${escHtml(p.member)}</span>\`).join(', ');
      } else {
        const shown = activePlayers.slice(0, 3).map(p => \`<span style="color:#4ade80;font-weight:600;">\${escHtml(p.member)}</span>\`).join(', ');
        activeNamesHTML = \`\${shown} <span style="color:var(--muted);">+\${activePlayers.length - 3} more</span>\`;
      }
      
      const winnerHTML = winner ? \`
        <div style="margin-top:1rem;padding:1rem;background:#052e16;border:1px solid #22c55e;border-radius:var(--radius-md);">
          <div style="color:#4ade80;font-weight:700;margin-bottom:.5rem;">🏆 Winner!</div>
          <div style="color:#fff;font-size:1.1em;">\${escHtml(winner.member)}</div>
          <div style="color:var(--muted);font-size:.85em;">Prize: \${fmtMoney(winner.prize)}</div>
        </div>\` : '';
        
      return \`
        <div class="card" style="flex:1;min-width:280px;">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem;">
            <h4 style="margin:0;color:#ef4444;">\${escHtml(ko.name)}</h4>
            <span class="pill" style="background:#3f1d1d;color:#fca5a5;border:1px solid #ef4444;">\${ko.status === 'completed' ? 'Completed' : 'Active'}</span>
            <span class="pill" style="background:#1a1000;color:#fbbf24;border:1px solid #f59e0b;margin-left:auto;">Prize: \${fmtMoney(koPrizeEach)}</span>
          </div>
          <p style="color:var(--muted);font-size:.82em;margin:-.25rem 0 .75rem;">
            Uses <strong>game \${ko.id}</strong> of each round. Tip incorrectly and you're out.
          </p>
          <div style="display:grid;gap:1rem;" class="responsive-2col">
            <div>
              <div style="color:var(--muted);font-size:.8rem;margin-bottom:.25rem;">Active</div>
              <div style="font-size:1.4rem;font-weight:800;color:#4ade80;">\${activePlayers.length}</div>
              <div style="margin-top:.5rem;color:var(--muted);font-size:.85em;">\${activeNamesHTML}</div>
            </div>
            <div>
              <div style="color:var(--muted);font-size:.8rem;margin-bottom:.25rem;">Eliminated</div>
              <div style="font-size:1.4rem;font-weight:800;color:#ef4444;">\${eliminatedCount}</div>
            </div>
          </div>
          \${winnerHTML}
        </div>
      \`;
    }).join('');
  }
        `);
        content = content.replace(/renderKnockout\(data.knockout\);/, `renderKnockout(data.knockout, data.prizes);`);
    }

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});

console.log('All files updated.');
