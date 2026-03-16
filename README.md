# CRE Intelligence Hub — Nexus Asia
AI-powered Commercial Real Estate platform for Mumbai. Built with Grok AI API.

## 🚀 Quick Start

### 1. Set up Supabase (optional but recommended)
1. Go to https://supabase.com → create a new project
2. Go to SQL Editor → paste and run `supabase-schema.sql`
3. Copy your Project URL and anon key from Settings → API
4. Open `js/config.js` → fill in:
   - `SUPABASE_URL: 'https://your-project.supabase.co'`
   - `SUPABASE_ANON_KEY: 'your-anon-key'`
   - `ENABLE_SUPABASE: true`

### 2. Deploy
- **GitHub Pages:** Push this folder → Settings → Pages → Deploy from main
- **Netlify/Vercel:** Drag & drop the folder
- **Local:** Open index.html in Chrome (no server needed)

### 3. Use the App
1. Open the app in browser
2. Upload your Excel/CSV/PDF files using the right panel
3. On first message, enter your Grok API key (from https://console.x.ai)
4. Start querying your CRE data!

## 📁 File Structure
```
├── index.html              ← Main app shell
├── index.css               ← Full dark theme styles
├── supabase-schema.sql     ← Run in Supabase SQL Editor
├── README.md
└── js/
    ├── config.js           ← API keys, settings, market data
    ├── supabaseClient.js   ← Supabase integration (NEW)
    ├── knowledgeGraph.js   ← In-memory data store
    ├── fileManager.js      ← File parsing (Excel/PDF/Word/ZIP)
    ├── chatEngine.js       ← Chat UI + streaming bubbles
    ├── queryRouter.js      ← Intent detection + routing
    ├── grokClient.js       ← Grok API (streaming, upgraded)
    ├── reportGenerator.js  ← Report export
    ├── uiController.js     ← Sidebar, stats, queue
    └── app.js              ← Main orchestrator (upgraded)
```

## 🔑 Key Upgrades vs Original
| Feature | Before | After |
|---|---|---|
| Context window | 80,000 chars | 400,000 chars |
| Max response tokens | 2,048 | 8,192 |
| Streaming | ❌ | ✅ Word-by-word |
| Supabase persistence | ❌ | ✅ Full |
| Session restore | ❌ | ✅ Auto-detect |
| Model auto-switch | ❌ | ✅ grok-3 / grok-3-mini |
| Saved deals | ❌ | ✅ Sidebar |
| Query logging | ❌ | ✅ Supabase |
