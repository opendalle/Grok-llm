// ═══════════════════════════════════════════════════════════
// uiController.js — Sidebar, Stats, File List, Insights Panel
// ═══════════════════════════════════════════════════════════

const UIController = (() => {
  let _recentQueries = [];

  // ── STATS ────────────────────────────────────────────────
  const updateStats = () => {
    const s = KnowledgeGraph.stats();
    const safe = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    safe('stat-files',      s.files);
    safe('stat-properties', s.properties);
    safe('stat-leases',     s.leases);
    safe('stat-contacts',   s.contacts);
    safe('file-count-badge', s.files);
  };

  // ── ACTIVE FILES LIST ─────────────────────────────────────
  const updateFileList = () => {
    const list = document.getElementById('active-files-list');
    if (!list) return;
    const idx = KnowledgeGraph.getFileIndex();
    const entries = Object.entries(idx);
    if (entries.length === 0) {
      list.innerHTML = '<div class="empty-state-small">No files uploaded yet</div>';
      return;
    }
    list.innerHTML = entries.map(([name, meta]) => {
      const ext = name.split('.').pop().toLowerCase();
      const badgeClass = FileManager.getBadgeClass(ext);
      const badgeLabel = FileManager.getBadgeLabel(ext);
      const shortName = name.length > 22 ? name.slice(0, 20) + '…' : name;
      return `
        <div class="file-item" id="filelist-${_safeId(name)}">
          <div class="file-type-badge badge-${badgeClass}">${badgeLabel}</div>
          <div class="file-item-info">
            <div class="file-item-name" title="${name}">${shortName}</div>
            <div class="file-item-meta">${meta.rowCount} ${meta.schema === 'PDF_DOCUMENT' ? 'pages' : 'rows'} · ${meta.schema.replace(/_/g,' ')}</div>
          </div>
          <span class="file-status" title="Ready">✅</span>
          <button class="file-remove" title="Remove from session" onclick="App.removeFile('${name.replace(/'/g,"\\'")}')">×</button>
        </div>`;
    }).join('');
  };

  // ── QUICK INSIGHTS PANEL ──────────────────────────────────
  const updateInsights = () => {
    const insights = document.getElementById('quick-insights-content');
    const exportBtn = document.getElementById('export-summary-btn');
    if (!insights) return;
    const stats = KnowledgeGraph.stats();

    if (stats.files === 0) {
      insights.innerHTML = `
        <div class="quick-insights-empty">
          <div class="insights-placeholder-icon">📊</div>
          <div class="insights-placeholder-text">Upload files to see instant insights</div>
        </div>`;
      if (exportBtn) exportBtn.style.display = 'none';
      return;
    }

    const avail = KnowledgeGraph.availableProperties().length;
    const exp2025 = KnowledgeGraph.expiringLeases(2025).length;
    const exp2026 = KnowledgeGraph.expiringLeases(2026).length;

    // Avg rents by location from properties
    const rentByLoc = {};
    KnowledgeGraph.get('properties').forEach(p => {
      if (!p.location || !p.rent) return;
      const loc = (p.location+'').split(',')[0].trim().substring(0, 14);
      if (!rentByLoc[loc]) rentByLoc[loc] = [];
      const r = parseFloat(p.rent);
      if (!isNaN(r)) rentByLoc[loc].push(r);
    });
    const topLocs = Object.entries(rentByLoc).sort((a,b)=>b[1].length-a[1].length).slice(0,2);
    const rentLines = topLocs.map(([loc, rents]) => {
      const avg = Math.round(rents.reduce((a,b)=>a+b,0)/rents.length);
      return `<div class="insight-row">
        <div><div class="insight-label">💰 Avg Rent — ${loc}</div></div>
        <div class="insight-value">₹${avg}/sqft</div>
      </div>`;
    }).join('');

    insights.innerHTML = `
      <div class="insights-grid">
        <div class="insight-row">
          <div>
            <div class="insight-label">🏢 Properties</div>
            <div class="insight-sub">Available: ${avail}</div>
          </div>
          <div class="insight-value">${stats.properties}</div>
        </div>
        <div class="insight-row">
          <div>
            <div class="insight-label">📋 Leases</div>
            <div class="insight-sub">Exp 2025: ${exp2025} | 2026: ${exp2026}</div>
          </div>
          <div class="insight-value">${stats.leases}</div>
        </div>
        <div class="insight-row">
          <div><div class="insight-label">👥 Contacts</div></div>
          <div class="insight-value">${stats.contacts}</div>
        </div>
        ${rentLines}
      </div>`;

    if (exportBtn) exportBtn.style.display = 'block';
  };

  // ── RECENT QUERIES ────────────────────────────────────────
  const addRecentQuery = (query) => {
    _recentQueries = [query, ..._recentQueries.filter(q => q !== query)].slice(0, 5);
    const list = document.getElementById('recent-queries-list');
    if (!list) return;
    if (_recentQueries.length === 0) {
      list.innerHTML = '<div class="empty-state-small">No queries yet</div>';
      return;
    }
    list.innerHTML = _recentQueries.map(q => {
      const short = q.length > 40 ? q.slice(0, 38) + '…' : q;
      return `<button class="recent-query-chip" onclick="App.submitQuery('${q.replace(/'/g,"\\'").replace(/\n/g,' ')}')" title="${q}">${short}</button>`;
    }).join('');
  };

  // ── PROCESSING QUEUE (right panel) ───────────────────────
  const addToQueue = (filename) => {
    const queue = document.getElementById('processing-queue');
    const section = document.getElementById('processing-queue-section');
    if (!queue) return null;
    if (section) section.style.display = 'block';

    const id = `queue-${_safeId(filename)}`;
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.id = id;
    item.innerHTML = `
      <div class="queue-item-header">
        <span class="queue-item-name">📄 ${filename.length > 24 ? filename.slice(0,22)+'…' : filename}</span>
      </div>
      <div class="file-proc-bar-wrap"><div class="file-proc-bar" id="${id}-bar" style="width:0%"></div></div>
      <div class="queue-step" id="${id}-step">Queued...</div>`;
    queue.appendChild(item);
    return id;
  };

  const updateQueueItem = (id, pct, step) => {
    const bar = document.getElementById(`${id}-bar`);
    const stepEl = document.getElementById(`${id}-step`);
    if (bar) bar.style.width = `${pct}%`;
    if (stepEl) stepEl.textContent = step;
  };

  const completeQueueItem = (id, schema) => {
    const bar = document.getElementById(`${id}-bar`);
    const stepEl = document.getElementById(`${id}-step`);
    if (bar) { bar.style.width = '100%'; bar.style.animation='none'; bar.style.background='var(--green)'; }
    if (stepEl) stepEl.innerHTML = `<span class="text-green">✅ Done — ${schema}</span>`;
    setTimeout(() => {
      const item = document.getElementById(id);
      if (item) item.style.opacity = '0.5';
    }, 3000);
  };

  const removeFromQueue = (id) => {
    const item = document.getElementById(id);
    if (item) item.remove();
    const queue = document.getElementById('processing-queue');
    const section = document.getElementById('processing-queue-section');
    if (queue && queue.children.length === 0 && section) section.style.display = 'none';
  };

  // ── HELPERS ──────────────────────────────────────────────
  const _safeId = (str) => str.replace(/[^a-z0-9]/gi, '_');

  return {
    updateStats,
    updateFileList,
    updateInsights,
    addRecentQuery,
    addToQueue,
    updateQueueItem,
    completeQueueItem,
    removeFromQueue,
  };
})();

window.UIController = UIController;
