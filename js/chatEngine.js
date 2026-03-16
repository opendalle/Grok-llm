// ═══════════════════════════════════════════════════════════
// chatEngine.js — Message Rendering & Chat UI
// ═══════════════════════════════════════════════════════════

const ChatEngine = (() => {
  let _typingRow = null;

  // ── TIMESTAMP ───────────────────────────────────────────
  const _ts = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // ── SANITIZE (basic XSS protection for user input) ──────
  const _esc = (str) => (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // ── MARKDOWN → HTML (lightweight) ───────────────────────
  const _md = (text) => {
    let html = text
      // Code blocks
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="lang-${lang||''}">${_esc(code.trim())}</code></pre>`)
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // HR
      .replace(/^---$/gm, '<hr>')
      // Headings
      .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*?)$/gm, '<h3>$1</h3>')
      .replace(/^# (.*?)$/gm, '<h3>$1</h3>')
      // Blockquote
      .replace(/^> (.*?)$/gm, '<blockquote>$1</blockquote>')
      // Emoji highlights (⚠️ WARNING lines)
      .replace(/^(⚠️.*?)$/gm, '<p class="text-amber">$1</p>')
      .replace(/^(✅.*?)$/gm, '<p class="text-green">$1</p>')
      .replace(/^(🔴.*?)$/gm, '<p class="text-red">$1</p>')
      // Unordered list
      .replace(/^\s*[-•] (.+)$/gm, '<li>$1</li>')
      // Numbered list
      .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

    // Tables (markdown)
    html = _renderMarkdownTables(html);

    // Paragraphs (lines not already wrapped)
    const lines = html.split('\n');
    const out = [];
    for (const line of lines) {
      if (line.trim() === '') continue;
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|table|hr|p)/.test(line.trim())) {
        out.push(line);
      } else {
        out.push(`<p>${line}</p>`);
      }
    }
    return out.join('\n');
  };

  const _renderMarkdownTables = (html) => {
    // Match | header | row |
    return html.replace(/(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g, (match) => {
      const rows = match.trim().split('\n');
      const headers = rows[0].split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(h => h.trim());
      const dataRows = rows.slice(2).map(r =>
        r.split('|').filter((_, i, a) => i > 0 && i < a.length - 1).map(c => c.trim())
      );
      let t = '<table><thead><tr>';
      headers.forEach(h => { t += `<th>${h}</th>`; });
      t += '</tr></thead><tbody>';
      dataRows.forEach(row => {
        t += '<tr>';
        row.forEach(cell => { t += `<td>${cell}</td>`; });
        t += '</tr>';
      });
      t += '</tbody></table>';
      return t;
    });
  };

  // ── RENDER MESSAGE ──────────────────────────────────────
  const _getContainer = () => document.getElementById('chat-messages');

  const renderWelcome = () => {
    const container = _getContainer();
    container.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'msg-row ai-row welcome-msg';
    row.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div>
        <div class="msg-bubble">
          <strong>👋 Welcome to CRE Intelligence Hub!</strong><br><br>
          I'm your AI-powered CRE analyst. Upload your property databases, lease files,
          or any real estate documents — I'll analyze everything and answer your questions instantly.
          <br><br>
          <strong>📂 Start by uploading files</strong> using the panel on the right, or drag and drop files anywhere on this screen.
          <br><br>
          <strong>💡 Try asking me:</strong>
          <ul>
            <li>Show all available properties in Andheri East under ₹150/sqft</li>
            <li>Which leases are expiring in 2025?</li>
            <li>Match me properties for a 5,000 sqft requirement in BKC</li>
            <li>Extract all landlord contacts from the database</li>
            <li>Generate a market report for Western Suburbs</li>
          </ul>
        </div>
        <div class="msg-timestamp">${_ts()}</div>
      </div>
    `;
    container.appendChild(row);
  };

  const appendUserMessage = (text) => {
    const container = _getContainer();
    const row = document.createElement('div');
    row.className = 'msg-row user-row';
    row.innerHTML = `
      <div>
        <div class="msg-bubble">${_esc(text).replace(/\n/g, '<br>')}</div>
        <div class="msg-timestamp">${_ts()}</div>
      </div>
      <div class="msg-avatar" style="background:var(--blue);border-color:var(--blue)">👤</div>
    `;
    container.appendChild(row);
    _scrollToBottom();
  };

  const appendAIMessage = (markdown, isError = false) => {
    const container = _getContainer();
    removeTypingIndicator();
    const row = document.createElement('div');
    row.className = 'msg-row ai-row';
    const htmlContent = _md(markdown);
    row.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div style="flex:1;min-width:0;">
        <div class="msg-bubble${isError ? ' text-red' : ''}">${htmlContent}</div>
        <div class="msg-timestamp">${_ts()}</div>
      </div>
    `;
    container.appendChild(row);
    _scrollToBottom();
    return row;
  };

  const appendSystemCard = (html) => {
    const container = _getContainer();
    const card = document.createElement('div');
    card.innerHTML = html;
    container.appendChild(card.firstElementChild);
    _scrollToBottom();
    return card.firstElementChild;
  };

  // ── FILE PROCESSING CARD ─────────────────────────────────
  const appendFileCard = (filename) => {
    const container = _getContainer();
    const card = document.createElement('div');
    card.className = 'file-proc-card';
    card.id = `filecard-${filename.replace(/[^a-z0-9]/gi, '_')}`;
    card.innerHTML = `
      <div class="file-proc-header">📊 Processing file...</div>
      <div class="file-proc-name">📄 ${_esc(filename)}</div>
      <div class="file-proc-bar-wrap"><div class="file-proc-bar" style="width:0%"></div></div>
      <div class="file-proc-step">Initializing...</div>
    `;
    container.appendChild(card);
    _scrollToBottom();
    return card;
  };

  const updateFileCard = (card, pct, step) => {
    if (!card) return;
    card.querySelector('.file-proc-bar').style.width = `${pct}%`;
    card.querySelector('.file-proc-step').textContent = step;
  };

  const completeFileCard = (card, rowCount, schema, ext) => {
    if (!card) return;
    card.querySelector('.file-proc-bar').style.width = '100%';
    card.querySelector('.file-proc-bar').style.animation = 'none';
    card.querySelector('.file-proc-bar').style.background = 'var(--green)';
    card.querySelector('.file-proc-step').innerHTML =
      `<span class="file-proc-done">✅ Complete — ${rowCount} ${ext === 'PDF' ? 'pages' : 'rows'} loaded</span>` +
      `<br><span style="font-size:10px;color:var(--muted)">Schema: ${schema}</span>`;
  };

  // ── TYPING INDICATOR ─────────────────────────────────────
  const showTypingIndicator = () => {
    const container = _getContainer();
    const row = document.createElement('div');
    row.className = 'msg-row ai-row';
    row.id = 'typing-row';
    row.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;
    container.appendChild(row);
    _typingRow = row;
    _scrollToBottom();
  };

  const removeTypingIndicator = () => {
    if (_typingRow) { _typingRow.remove(); _typingRow = null; }
    const old = document.getElementById('typing-row');
    if (old) old.remove();
  };

  // ── SCROLL ───────────────────────────────────────────────
  const _scrollToBottom = () => {
    const container = _getContainer();
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  };

  return {
    renderWelcome,
    appendUserMessage,
    appendAIMessage,
    appendSystemCard,
    appendFileCard,
    updateFileCard,
    completeFileCard,
    showTypingIndicator,
    removeTypingIndicator,
  };
})();

window.ChatEngine = ChatEngine;
