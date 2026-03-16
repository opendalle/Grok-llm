// grokClient.js — Fixed & Compatible Version
const GrokClient = (() => {
  let apiKey = localStorage.getItem('nexus_grok_api_key') || CONFIG.GROK_API_KEY || null;
  let model = CONFIG.GROK_MODEL || 'grok-3';
  let history = [];
  const MAX_RETRIES = 3;

  const setStatus = (connected) => {
    const dot = document.getElementById('connection-status');
    if (!dot) return;
    dot.innerHTML = connected
      ? `<span class="status-dot green"></span><span class="status-text">Connected</span>`
      : `<span class="status-dot red"></span><span class="status-text">Offline</span>`;
  };

  // Show the in-page API key modal and resolve with the entered key (or null)
  const _showKeyModal = () => new Promise((resolve) => {
    const modal   = document.getElementById('api-key-modal');
    const input   = document.getElementById('api-key-input');
    const saveBtn = document.getElementById('api-key-save-btn');
    const cancelBtn = document.getElementById('api-key-cancel-btn');
    const errEl   = document.getElementById('api-key-error');

    if (!modal) { resolve(null); return; }

    // Pre-fill if already stored
    input.value = localStorage.getItem('nexus_grok_api_key') || '';
    errEl.style.display = 'none';
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    const done = (key) => {
      modal.style.display = 'none';
      saveBtn.removeEventListener('click', onSave);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      resolve(key);
    };

    const onSave = () => {
      const k = input.value.trim();
      if (!k) { errEl.style.display = 'block'; return; }
      done(k);
    };
    const onCancel = () => done(null);
    const onKeydown = (e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); };

    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
  });

  const getApiKey = async () => {
    if (apiKey) return apiKey;
    const stored = localStorage.getItem('nexus_grok_api_key');
    if (stored) { apiKey = stored; return apiKey; }
    const key = await _showKeyModal();
    if (key) {
      apiKey = key;
      localStorage.setItem('nexus_grok_api_key', apiKey);
      setStatus(true);
    }
    return apiKey;
  };

  const setApiKey  = (k) => { apiKey = k; localStorage.setItem('nexus_grok_api_key', k); setStatus(true); };
  const clearApiKey = () => { apiKey = null; localStorage.removeItem('nexus_grok_api_key'); setStatus(false); };

  const addHistory  = (role, content) => {
    history.push({ role, content });
    const max = (CONFIG.MAX_HISTORY_TURNS || 20) * 2;
    if (history.length > max) history = history.slice(-max);
  };
  const clearHistory = () => { history = []; };

  const send = async (userMessage, contextData) => {
    const key = await getApiKey();
    if (!key) return 'No API key provided. Click the ⚡ Grok AI button in the top bar to enter your key.';

    // Truncate context to avoid HTTP 400 from oversized payloads
    const maxChars = CONFIG.MAX_CONTEXT_CHARS || 40000;
    let ctx = contextData || 'No files uploaded yet.';
    if (ctx.length > maxChars) {
      ctx = ctx.slice(0, maxChars) + '\n\n[... context truncated for token limit ...]';
    }

    const systemPrompt = (CONFIG.SYSTEM_PROMPT || CONFIG.SYSTEMPROMPT || '')
      .replace('{{SESSION_DATA}}', ctx)
      .replace('SESSIONDATA', ctx);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(CONFIG.GROK_API_URL || 'https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.3,
            max_tokens: CONFIG.MAX_TOKENS || 4096,
            stream: false,
          }),
        });

        if (!resp.ok) {
          if (resp.status === 401) { clearApiKey(); return '❌ Invalid API key. Please refresh and enter a valid key.'; }
          if (resp.status === 429) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content;
        if (!reply) throw new Error('Empty response from Grok');
        addHistory('user', userMessage);
        addHistory('assistant', reply);
        setStatus(true);
        return reply;

      } catch (err) {
        if (attempt === MAX_RETRIES) { setStatus(false); return `❌ Connection error: ${err.message}`; }
        await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }
  };

  const localFallback = (userMessage) => {
    const q = userMessage.toLowerCase();
    const stats = KnowledgeGraph.stats;
    if (stats.files === 0) return '📂 No files uploaded yet. Upload your CRE data files using the right panel.';
    if (/find|show|list|available|search|propert/.test(q)) {
      const avail = KnowledgeGraph.availableProperties;
      if (!avail.length) return '⚠️ No available properties found in uploaded files.';
      let r = `Found **${avail.length}** available properties:\n\n| Building | Location | Carpet sqft | Rent ₹/sqft |\n|---|---|---|---|\n`;
      avail.slice(0, 20).forEach(p => r += `| ${p.building||'—'} | ${p.location||'—'} | ${p.carpet||p.bua||'—'} | ${p.rent||'—'} |\n`);
      return r;
    }
    if (/lease|expir|renew/.test(q)) {
      const leases = KnowledgeGraph.all.leases;
      if (!leases.length) return '⚠️ No lease data found.';
      let r = `Found **${leases.length}** leases:\n\n| Tenant | Building | Rent | End Date |\n|---|---|---|---|\n`;
      leases.slice(0, 20).forEach(l => r += `| ${l.tenant||'—'} | ${l.building||'—'} | ${l.rent||'—'} | ${l.endDate||'—'} |\n`);
      return r;
    }
    if (/contact|phone|email/.test(q)) {
      const contacts = KnowledgeGraph.all.contacts;
      if (!contacts.length) return '⚠️ No contacts found.';
      let r = `Found **${contacts.length}** contacts:\n\n| Name | Company | Phone | Email |\n|---|---|---|---|\n`;
      contacts.slice(0, 20).forEach(c => r += `| ${c.name||'—'} | ${c.company||'—'} | ${c.phone||'—'} | ${c.email||'—'} |\n`);
      return r;
    }
    return `📊 **Session:** ${stats.files} files | ${stats.properties} properties | ${stats.leases} leases | ${stats.contacts} contacts\n\n_Add Grok API key for full AI analysis._`;
  };

  // hasKey as a FUNCTION — fixes "is not a function" error
  const hasKey = () => !!(apiKey || localStorage.getItem('nexus_grok_api_key'));

  return {
    send,
    localFallback,
    addHistory,
    clearHistory,
    setApiKey,
    getApiKey,
    clearApiKey,
    setStatus,
    hasKey,
    setModel: (m) => { model = m; },
  };
})();

window.GrokClient = GrokClient;
