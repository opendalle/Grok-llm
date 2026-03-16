// app.js — Main App Orchestrator | Nexus Asia CRE Intelligence Hub (UPGRADED)
const App = (() => {
  let isProcessing = false;
  let isSending = false;

  // ── INIT ─────────────────────────────────────────────────────────────────
  const init = async () => {
    ChatEngine.renderWelcome();
    bindInputEvents();
    bindUploadEvents();
    bindDragDrop();
    bindQuickChips();
    bindMobile();
    UIController.updateStats();
    UIController.updateInsights();
    UIController.updateFileList();

    if (GrokClient.hasKey()) {
      console.log('CRE Hub: API key ready.');
      GrokClient.setStatus(true);
    } else {
      // No key stored — show modal so user can enter it once (saves to localStorage)
      setTimeout(() => GrokClient.getApiKey(), 600);
    }

    // Topbar "⚡ Grok AI" button opens the modal to change key
    const grokKeyBtn = document.getElementById('grok-key-btn');
    if (grokKeyBtn) {
      grokKeyBtn.addEventListener('click', async () => {
        GrokClient.clearApiKey();
        await GrokClient.getApiKey();
      });
    }

    // Try localStorage restore first (works without Supabase)
    const localRestored = KnowledgeGraph.loadFromLocal();
    if (localRestored) {
      refreshUI();
      ChatEngine.appendAIMessage('🔄 Previous session restored from local storage. Your files are back!');
    }

    // Init Supabase + try session restore
    const sbOk = SupabaseClient.init();
    if (sbOk) {
      const saved = await SupabaseClient.loadSession();
      if (saved && saved.properties?.length > 0) {
        showRestoreBanner(saved);
      }
      loadSavedDealsToSidebar();
    }
  };

  // ── SESSION RESTORE BANNER ────────────────────────────────────────────────
  const showRestoreBanner = (saved) => {
    const count = (saved.properties?.length || 0) + (saved.leases?.length || 0);
    const banner = document.createElement('div');
    banner.className = 'restore-banner';
    banner.innerHTML = `
      <span>🔄 Previous session found — ${saved.properties?.length || 0} properties, ${saved.leases?.length || 0} leases. Restore?</span>
      <button class="btn-restore-yes" onclick="App.restoreSession()">Yes, Restore</button>
      <button class="btn-restore-no" onclick="this.parentElement.remove()">No Thanks</button>
    `;
    document.querySelector('.chat-topbar')?.after(banner);
  };

  const restoreSession = async () => {
    const saved = await SupabaseClient.loadSession();
    if (!saved) return;
    if (saved.properties?.length) saved.properties.forEach(p => KnowledgeGraph.addProperty(p, 'supabase'));
    if (saved.leases?.length)     saved.leases.forEach(l => KnowledgeGraph.addLease(l, 'supabase'));
    if (saved.tenants?.length)    saved.tenants.forEach(t => KnowledgeGraph.addTenant(t, 'supabase'));
    if (saved.contacts?.length)   saved.contacts.forEach(c => KnowledgeGraph.addContact(c, 'supabase'));
    if (saved.file_index)         Object.assign(KnowledgeGraph.getFileIndex(), saved.file_index);
    refreshUI();
    document.querySelector('.restore-banner')?.remove();
    ChatEngine.appendAIMessage('✅ Previous session restored! All your data is back. Ask me anything.');
  };

  // ── LOAD SAVED DEALS TO SIDEBAR ───────────────────────────────────────────
  const loadSavedDealsToSidebar = async () => {
    const deals = await SupabaseClient.getSavedDeals();
    UIController.renderSavedDeals(deals);
  };

  // ── INPUT EVENTS ──────────────────────────────────────────────────────────
  const bindInputEvents = () => {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    const syncBtn = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      sendBtn.disabled = !input.value.trim();
    };

    // Cover typing, paste, programmatic changes
    input.addEventListener('input', syncBtn);
    input.addEventListener('paste', () => setTimeout(syncBtn, 0));
    input.addEventListener('keyup', syncBtn);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim() && !isSending) handleSend();
      }
    });

    sendBtn.addEventListener('click', () => {
      if (!isSending && input.value.trim()) handleSend();
    });
  };

  // ── SEND MESSAGE ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const input = document.getElementById('chat-input');
    const query = input.value.trim();
    if (!query || isSending) return;
    isSending = true;
    document.getElementById('send-btn').disabled = true;
    input.value = '';
    input.style.height = 'auto';

    ChatEngine.appendUserMessage(query);
    UIController.addRecentQuery(query);

    if (CONFIG.STREAM && GrokClient.hasKey) {
      // Streaming path
      const { intent, context } = QueryRouter.prepareRoute(query);
      const bubbleEl = ChatEngine.appendAIMessageStream();
      await GrokClient.sendStreaming(
        query, context, intent,
        (token) => ChatEngine.appendStreamToken(bubbleEl, token),
        (full)  => { ChatEngine.finalizeStreamBubble(bubbleEl, full); afterSend(); },
        (err)   => { ChatEngine.finalizeStreamBubble(bubbleEl, `⚠️ ${err}`); afterSend(); }
      );
    } else {
      // Non-streaming path
      ChatEngine.showTypingIndicator();
      try {
        const { reply } = await QueryRouter.route(query);
        ChatEngine.appendAIMessage(reply);
      } catch (err) {
        ChatEngine.appendAIMessage(`⚠️ Something went wrong: ${err.message}`, true);
      }
      afterSend();
    }
  };

  const afterSend = () => {
    isSending = false;
    document.getElementById('send-btn').disabled = !document.getElementById('chat-input').value.trim();
    document.getElementById('chat-input').focus();
  };

  const submitQuery = async (query) => {
    document.getElementById('chat-input').value = query;
    await handleSend();
  };

  // ── FILE UPLOAD EVENTS ────────────────────────────────────────────────────
  const bindUploadEvents = () => {
    const fileInput = document.getElementById('main-file-input');
    const uploadZone = document.getElementById('upload-zone');
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFiles(Array.from(e.target.files)); fileInput.value = ''; });
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); const files = Array.from(e.dataTransfer.files); if (files.length) handleFiles(files); });
  };

  // ── GLOBAL DRAG DROP OVERLAY ──────────────────────────────────────────────
  const bindDragDrop = () => {
    const overlay = document.getElementById('drag-overlay');
    let dragCounter = 0;
    document.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; if (dragCounter === 1) overlay.classList.remove('hidden'); });
    document.addEventListener('dragleave', (e) => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; overlay.classList.add('hidden'); } });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => { e.preventDefault(); dragCounter = 0; overlay.classList.add('hidden'); const files = Array.from(e.dataTransfer.files); if (files.length) handleFiles(files); });
  };

  // ── PROCESS FILES ─────────────────────────────────────────────────────────
  const handleFiles = async (files) => {
    if (isProcessing) { ChatEngine.appendAIMessage('⏳ Already processing files. Please wait...'); return; }

    const validFiles = files.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (!['xlsx','xls','csv','pdf','doc','docx','txt','zip','rar'].includes(ext)) {
        ChatEngine.appendAIMessage(`⚠️ Skipping **${f.name}** — unsupported format.`);
        return false;
      }
      const sizeMB = f.size / 1024 / 1024;
      if (sizeMB > CONFIG.MAX_FILE_SIZE_MB) {
        ChatEngine.appendAIMessage(`⚠️ **${f.name}** exceeds ${CONFIG.MAX_FILE_SIZE_MB}MB limit (${sizeMB.toFixed(1)}MB).`);
        return false;
      }
      if (FileManager.maxReached()) {
        ChatEngine.appendAIMessage(`⚠️ Max ${CONFIG.MAX_FILES_PER_SESSION} files per session reached. Clear session to start fresh.`);
        return false;
      }
      return true;
    });

    if (!validFiles.length) return;
    isProcessing = true;

    for (const file of validFiles) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      if (parseFloat(sizeMB) > 10) ChatEngine.appendAIMessage(`⏳ **${file.name}** is ${sizeMB}MB. Processing may take a moment...`);

      const chatCard = ChatEngine.appendFileCard(file.name);
      const queueId = UIController.addToQueue(file.name);

      try {
        await FileManager.processFile(file, {
          onProgress: (pct, step) => {
            ChatEngine.updateFileCard(chatCard, pct, `${step}...`);
            UIController.updateQueueItem(queueId, pct, `${step}...`);
          },
          onComplete: (rowCount, schema, ext, sheetCount) => {
            ChatEngine.completeFileCard(chatCard, rowCount, schema, ext);
            UIController.completeQueueItem(queueId, schema);
            FileManager.registerFile(file.name);
            if (SupabaseClient.isReady()) SupabaseClient.registerFile(file.name, schema, rowCount);
            refreshUI();
            KnowledgeGraph.saveToLocal(); // persist across refresh
            setTimeout(() => {
              const insights = KnowledgeGraph.generateInsights();
              let msg = `✅ **${file.name}** processed — ${rowCount} ${ext === 'PDF' ? 'pages' : 'rows'}\n📋 Schema: ${schema}`;
              if (sheetCount > 1) msg += ` | ${sheetCount} sheets`;
              if (insights.length) msg += `\n\n💡 **Auto Insights:**\n${insights.slice(0, 3).map((i, n) => `${n+1}. ${i}`).join('\n')}`;
              ChatEngine.appendAIMessage(msg);
            }, 500);
          },
          onError: (errMsg) => {
            if (chatCard) chatCard.querySelector('.file-proc-step').innerHTML = `<span class="text-red">${errMsg}</span>`;
            UIController.removeFromQueue(queueId);
            ChatEngine.appendAIMessage(`❌ ${errMsg}`, true);
          },
        });
      } catch (e) {
        ChatEngine.appendAIMessage(`❌ Error processing ${file.name}: ${e.message}`, true);
        UIController.removeFromQueue(queueId);
      }
    }

    isProcessing = false;

    // Consolidated summary for multiple files
    if (validFiles.length > 1) {
      setTimeout(() => {
        const summary = buildProcessingSummary();
        ChatEngine.appendAIMessage(summary);
        KnowledgeGraph.saveToLocal();
        // Save to Supabase
        if (SupabaseClient.isReady()) {
          SupabaseClient.saveSession(KnowledgeGraph.all, KnowledgeGraph.getFileIndex());
        }
      }, 800);
    } else {
      // Save single file session too
      if (SupabaseClient.isReady()) {
        setTimeout(() => SupabaseClient.saveSession(KnowledgeGraph.all, KnowledgeGraph.getFileIndex()), 1200);
      }
    }
  };

  const buildProcessingSummary = () => {
    const stats = KnowledgeGraph.stats();
    const idx = KnowledgeGraph.getFileIndex();
    const insights = KnowledgeGraph.generateInsights();
    let msg = `📊 **FILES PROCESSED:**\n${Object.entries(idx).map(([name, meta]) => `• ${name} — ${meta.rowCount} rows | ${meta.schema}`).join('\n')}\n\n`;
    msg += `🏢 **PROPERTIES FOUND:** ${stats.properties}\n`;
    msg += `📋 **LEASES FOUND:** ${stats.leases}\n`;
    msg += `👥 **TENANTS FOUND:** ${stats.tenants}\n`;
    msg += `📞 **CONTACTS EXTRACTED:** ${stats.contacts}\n`;
    const exp2025 = KnowledgeGraph.expiringLeases(2025).length;
    const exp2026 = KnowledgeGraph.expiringLeases(2026).length;
    if (exp2025 || exp2026) msg += `⏰ **EXPIRY:** ${exp2025} leases in 2025, ${exp2026} in 2026\n`;
    const opps = KnowledgeGraph.detectOpportunities();
    if (opps.length) msg += `💡 **OPPORTUNITIES:** ${opps.length} detected\n`;
    if (insights.length) msg += `\n🔍 **TOP INSIGHTS:**\n${insights.map((i, n) => `${n+1}. ${i}`).join('\n')}`;
    msg += `\n\n_Active files: ${Object.keys(idx).join(', ')}. Ask me anything about this data._`;
    return msg;
  };

  // ── UI REFRESH ────────────────────────────────────────────────────────────
  const refreshUI = () => {
    UIController.updateStats();
    UIController.updateFileList();
    UIController.updateInsights();
  };

  // ── QUICK CHIPS ───────────────────────────────────────────────────────────
  const bindQuickChips = () => {
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.dataset.query;
        const input = document.getElementById('chat-input');
        input.value = query;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });
  };

  // ── MOBILE ────────────────────────────────────────────────────────────────
  const bindMobile = () => {
    const hamburger = document.getElementById('hamburger-btn');
    if (hamburger) hamburger.addEventListener('click', toggleSidebar);
  };
  const toggleSidebar = () => { document.getElementById('left-sidebar').classList.toggle('open'); document.getElementById('sidebar-overlay').classList.toggle('hidden'); };
  const closeSidebar  = () => { document.getElementById('left-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.add('hidden'); };
  const toggleRightPanel = () => { document.getElementById('right-panel').classList.toggle('open'); document.getElementById('right-overlay').classList.toggle('hidden'); };
  const closeRightPanel  = () => { document.getElementById('right-panel').classList.remove('open'); document.getElementById('right-overlay').classList.add('hidden'); };

  // ── REMOVE FILE ───────────────────────────────────────────────────────────
  const removeFile = (filename) => {
    FileManager.removeFile(filename);
    const idx = KnowledgeGraph.getFileIndex();
    delete idx[filename];
    refreshUI();
    ChatEngine.appendAIMessage(`🗑️ **${filename}** removed from session.`);
  };

  // ── CLEAR SESSION ─────────────────────────────────────────────────────────
  const clearSession = () => {
    if (!confirm('Clear all uploaded files and chat history? This cannot be undone.')) return;
    KnowledgeGraph.reset(); // also clears localStorage
    GrokClient.clearHistory();
    refreshUI();
    ChatEngine.renderWelcome();
    UIController.updateStats();
    ChatEngine.appendAIMessage('🔄 Session cleared. Upload new files to begin.');
  };

  // ── EXPORT ────────────────────────────────────────────────────────────────
  const exportSummary = () => {
    const report = ReportGenerator.exportSummary();
    ChatEngine.appendAIMessage(`📥 Session summary exported.\n\n${report.slice(0, 300)}...`);
  };

  return {
    init, submitQuery, removeFile, clearSession, exportSummary,
    restoreSession, loadSavedDealsToSidebar,
    toggleSidebar, closeSidebar, toggleRightPanel, closeRightPanel,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
window.App = App;
