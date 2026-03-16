// config.js — CRE Intelligence Hub | Nexus Asia
const CONFIG = {
  // ── API ──────────────────────────────────────────────────────────────────
  GROK_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROK_MODEL: 'llama-3.3-70b-versatile',  // Groq's best model (fast + free)
  GROK_MODEL_FAST: 'llama-3.1-8b-instant', // Groq fast model for simple queries
  GROK_API_KEY: '',               // never store key here — enter via the ⚡ button in the UI

  // ── SUPABASE ─────────────────────────────────────────────────────────────
  SUPABASE_URL: 'https://ntvfqyrcdwwwyzwiksgv.supabase.co',               // paste your Supabase project URL here
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50dmZxeXJjZHd3d3l6d2lrc2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzUxMzQsImV4cCI6MjA4OTI1MTEzNH0.dCZEqLPiz1YS0Xoodu6bmgYxnzIMh55I9bc8bagfd0c',          // paste your Supabase anon key here
  ENABLE_SUPABASE: false,         // set true after adding keys above

  // ── LIMITS (UPGRADED) ────────────────────────────────────────────────────
  MAX_FILE_SIZE_MB: 50,
  MAX_FILES_PER_SESSION: 20,
  MAX_CONTEXT_CHARS: 40000,       // safe limit per request (~10k tokens); Grok handles more but 400 errors above this
  MAX_HISTORY_TURNS: 20,
  MAX_TOKENS: 8192,               // upgraded from 2048 — prevents cut-off responses
  STREAM: false,                  // streaming disabled (sendStreaming not implemented)

  // ── PROCESSING ───────────────────────────────────────────────────────────
  SCHEMA_CONFIDENCE_THRESHOLD: 0.3,

  // ── MUMBAI MICRO-MARKETS ─────────────────────────────────────────────────
  MARKETS: {
    BKC:          { min: 300, max: 600,  label: 'BKC / New CBD',        grade: 'Premium Grade A' },
    NARIMAN_POINT:{ min: 200, max: 400,  label: 'Nariman Pt / Fort',     grade: 'Grade A/B Heritage' },
    ANDHERI_EAST: { min: 80,  max: 180,  label: 'Andheri East/West',     grade: 'Mid-market' },
    GOREGAON:     { min: 70,  max: 150,  label: 'Goregaon / Malad',      grade: 'Growing' },
    BKC_PERIPHERY:{ min: 120, max: 250,  label: 'Bandra West / Khar',    grade: 'Emerging' },
    LOWER_PAREL:  { min: 100, max: 250,  label: 'Worli / Lower Parel',   grade: 'Mixed' },
    NAVI_MUMBAI:  { min: 50,  max: 120,  label: 'Navi Mumbai',           grade: 'IT/ITeS Hub' },
    THANE:        { min: 40,  max: 100,  label: 'Thane',                 grade: 'Affordable' },
  },

  // ── SCHEMA DETECTION KEYWORDS ────────────────────────────────────────────
  SCHEMA_PATTERNS: {
    LEASE_DATABASE:     ['Tenant','Landlord','Lockin Period','Lease Expiry Date','Commencement Date','Current Rent (Chargeable)','Landlord Representative','Tenant Representative'],
    PROPERTY_INVENTORY: ['BUA (Sq.ft)','QUOTED RENT/SQ.FT./PER MTH.','AVAILABLE (YES/NO)','HANDOVER COND','DEVELOPER/ INVESTOR/ LANDLORD','CONTACTS DETAILS','Building Name'],
    TENANT_DATABASE:    ['requirement','sector','industry','headcount','preferred','timeline','budget','seat','workstation'],
    FINANCIAL_DATA:     ['yield','irr','cap rate','noi','revenue','escalation','return','investment','valuation'],
    DEAL_PIPELINE:      ['stage','status','pipeline','broker','deal','shortlisted','loi','mou','negotiation'],
    CONTACT_LIST:       ['phone','mobile','email','designation','company','contact','poc','person'],
  },

  // ── SYSTEM PROMPT FOR GROK ───────────────────────────────────────────────
  SYSTEM_PROMPT: `You are a senior CRE (Commercial Real Estate) intelligence analyst embedded in CRE Intelligence Hub — a PropTech platform built by Nexus Asia for Mumbai's office, retail, and industrial property markets.

YOUR ROLE:
You are a deal analyst, market researcher, and tenant-landlord matchmaker.
You work exclusively with data extracted from user-uploaded files (Excel, CSV, PDF, Word, TXT).
You speak like a senior CRE broker: data-driven, concise, deal-focused, professional.
You NEVER hallucinate data. If data is missing or not in uploaded files, say "Not found in uploaded files."

RESPONSE FORMAT RULES:
- Start every response with a 1-line direct answer, then expand.
- Use emoji section headers: 📍 🏢 💰 📞 📋 ✅ ⚠️ 💡
- Present tabular data as markdown tables with headers.
- Numbers with units: ₹/sqft/month, sq.ft. BUA/Carpet, months, years.
- Contacts format: Name — Company — Phone — Email
- Flag data issues inline: ⚠️ [Missing rent data for this row]
- For property queries: rank by best fit → Building | Location | Floor | Carpet | Rent | Condition | Contact
- For deal matching: top 5 matches with fit score (0–100) and 2-line reasoning per match.
- For market intelligence: avg rent per micro-market, supply/demand, grade breakdown.

MUMBAI MICRO-MARKET KNOWLEDGE:
- BKC / New CBD: Premium Grade A | ₹300–₹600/sqft
- Nariman Pt / Fort: Heritage Grade A/B | ₹200–₹400/sqft
- Andheri East/West: Mid-market | ₹80–₹180/sqft
- Goregaon / Malad: Growing | ₹70–₹150/sqft
- BKC Periphery (Bandra West, Khar): Emerging | ₹120–₹250/sqft
- Worli / Lower Parel: Mixed | ₹100–₹250/sqft
- Navi Mumbai: IT/ITeS hub | ₹50–₹120/sqft
- Thane: Affordable | ₹40–₹100/sqft

CURRENT SESSION DATA:
{{SESSION_DATA}}`,
};

window.CONFIG = CONFIG;
