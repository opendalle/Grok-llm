// ═══════════════════════════════════════════════════════════
// knowledgeGraph.js — In-memory CRE Knowledge Graph
// Stores all extracted data: properties, leases, tenants, contacts
// ═══════════════════════════════════════════════════════════

const KnowledgeGraph = (() => {
  let _data = {
    properties:  [],   // {id, building, location, floor, bua, carpet, rent, availability, condition, contacts, source}
    leases:      [],   // {id, tenant, landlord, building, location, rent, startDate, endDate, lockIn, cam, source}
    tenants:     [],   // {id, company, sector, requirement, budget, timeline, contacts, source}
    contacts:    [],   // {id, name, company, role, phone, email, building, source}
    deals:       [],   // {id, stage, broker, client, property, status, source}
    financials:  [],   // {id, property, yield, irr, capRate, source}
    rawText:     [],   // {filename, text} — fallback for unstructured data
    fileIndex:   {},   // filename → { schema, rowCount, sheetCount }
  };

  let _idCounter = 1;
  const _nextId = () => `kn_${_idCounter++}`;

  return {
    // ── GETTERS ─────────────────────────────────────────────
    get: (type) => _data[type] || [],
    all: () => _data,

    getFileIndex: () => _data.fileIndex,

    stats: () => ({
      files:      Object.keys(_data.fileIndex).length,
      properties: _data.properties.length,
      leases:     _data.leases.length,
      tenants:    _data.tenants.length,
      contacts:   _data.contacts.length,
      deals:      _data.deals.length,
    }),

    expiringLeases: (year) => {
      return _data.leases.filter(l => {
        if (!l.endDate) return false;
        try {
          const d = new Date(l.endDate);
          return !isNaN(d) && d.getFullYear() === year;
        } catch { return false; }
      });
    },

    availableProperties: () => _data.properties.filter(p =>
      p.availability && !['leased','occupied','not available'].includes(
        (p.availability + '').toLowerCase()
      )
    ),

    // ── ADDERS ──────────────────────────────────────────────
    addProperty: (p, source) => {
      _data.properties.push({ id: _nextId(), ...p, source });
    },
    addLease: (l, source) => {
      _data.leases.push({ id: _nextId(), ...l, source });
    },
    addTenant: (t, source) => {
      _data.tenants.push({ id: _nextId(), ...t, source });
    },
    addContact: (c, source) => {
      // deduplicate by phone or email
      const dupe = _data.contacts.find(x =>
        (c.phone && x.phone === c.phone) ||
        (c.email && x.email === c.email)
      );
      if (!dupe) _data.contacts.push({ id: _nextId(), ...c, source });
    },
    addDeal: (d, source) => {
      _data.deals.push({ id: _nextId(), ...d, source });
    },
    addRawText: (filename, text) => {
      _data.rawText.push({ filename, text });
    },

    // Register a file in the index
    registerFile: (filename, meta) => {
      _data.fileIndex[filename] = meta;
    },

    // ── SEARCH ──────────────────────────────────────────────
    searchProperties: (query) => {
      const q = query.toLowerCase();
      return _data.properties.filter(p =>
        [p.building, p.location, p.floor, p.condition, p.sector]
          .some(v => v && v.toString().toLowerCase().includes(q))
      );
    },

    searchByRent: (maxRent) => {
      return _data.properties.filter(p => {
        const r = parseFloat(p.rent);
        return !isNaN(r) && r <= maxRent;
      }).sort((a, b) => parseFloat(a.rent) - parseFloat(b.rent));
    },

    // ── CROSS-LINKING ────────────────────────────────────────
    // Find properties where a tenant's lease is about to expire
    matchExpiringToInventory: () => {
      const expiring = _data.leases.filter(l => {
        if (!l.endDate) return false;
        const end = new Date(l.endDate);
        const now = new Date();
        const monthsLeft = (end - now) / (1000 * 60 * 60 * 24 * 30);
        return monthsLeft >= 0 && monthsLeft <= 18;
      });
      return expiring.map(lease => ({
        lease,
        alternatives: _data.properties.filter(p =>
          p.availability &&
          !['leased','occupied'].includes((p.availability + '').toLowerCase()) &&
          (p.location || '').toLowerCase().includes((lease.location || '').toLowerCase().split(' ')[0])
        ).slice(0, 3),
      }));
    },

    // ── OPPORTUNITY DETECTION ────────────────────────────────
    detectOpportunities: () => {
      const opportunities = [];
      _data.properties.forEach(p => {
        if (!p.rent || !p.location) return;
        const rent = parseFloat(p.rent);
        if (isNaN(rent)) return;
        // Compare with market benchmark
        const loc = (p.location + '').toLowerCase();
        let market = null;
        if (loc.includes('bkc') || loc.includes('bandra kurla'))        market = CONFIG.MARKETS.BKC;
        else if (loc.includes('lower parel') || loc.includes('worli'))  market = CONFIG.MARKETS.LOWER_PAREL;
        else if (loc.includes('andheri'))                                market = CONFIG.MARKETS.ANDHERI_EAST;
        else if (loc.includes('goregaon') || loc.includes('malad'))     market = CONFIG.MARKETS.GOREGAON;
        else if (loc.includes('navi mumbai') || loc.includes('vashi'))  market = CONFIG.MARKETS.NAVI_MUMBAI;
        else if (loc.includes('thane'))                                  market = CONFIG.MARKETS.THANE;

        if (market && rent < market.min * 0.85) {
          opportunities.push({ type: 'UNDERPRICED', property: p, market, rent, avgMin: market.min });
        }
      });

      // Leases expiring within 12 months
      const now = new Date();
      _data.leases.forEach(l => {
        if (!l.endDate) return;
        const end = new Date(l.endDate);
        const monthsLeft = (end - now) / (1000 * 60 * 60 * 24 * 30);
        if (monthsLeft >= 0 && monthsLeft <= 12) {
          opportunities.push({ type: 'EXPIRING_LEASE', lease: l, monthsLeft: Math.round(monthsLeft) });
        }
      });

      return opportunities;
    },

    // ── CONTEXT SUMMARY FOR AI ───────────────────────────────
    buildContextSummary: (queryHint) => {
      const s = _data;
      const idx = _data.fileIndex;
      const q = (queryHint || '').toLowerCase();
      let ctx = '';

      if (Object.keys(idx).length > 0) {
        ctx += `\n\n== UPLOADED FILES ==\n`;
        for (const [fname, meta] of Object.entries(idx)) {
          ctx += `• ${fname}: ${meta.schema} | ${meta.rowCount} rows\n`;
        }
      }

      // Smart sampling: if query mentions a building/location, prioritise those rows
      const filterRows = (rows, fields) => {
        if (!q) return rows.slice(0, 40);
        const terms = q.split(/\s+/).filter(t => t.length > 3);
        const matched = rows.filter(r =>
          terms.some(t => fields.some(f => (r[f]||'').toLowerCase().includes(t)))
        );
        const rest = rows.filter(r => !matched.includes(r));
        return [...matched.slice(0, 40), ...rest.slice(0, Math.max(0, 40 - matched.length))];
      };

      if (s.leases.length) {
        const sample = filterRows(s.leases, ['building','tenant','location','macroMarket']);
        ctx += `\n\n== LEASE DATABASE (${s.leases.length} total records) ==\n`;
        ctx += sample.map(l =>
          `Tenant: ${l.tenant||'?'} | Building: ${l.building||'?'} | Location: ${l.location||'?'} | Macro: ${l.macroMarket||'?'} | ` +
          `Rent: ₹${l.rent||'?'}/sqft | Expiry: ${l.endDate||'?'} | Lock-in: ${l.lockIn||'?'} months | ` +
          `Landlord: ${l.landlord||'?'} | LandlordRep: ${l.landlordRep||'?'} | TenantRep: ${l.tenantRep||'?'}`
        ).join('\n');
        if (s.leases.length > 40) ctx += `\n... and ${s.leases.length - 40} more records`;
      }

      if (s.properties.length) {
        const sample = filterRows(s.properties, ['building','location','landlord']);
        ctx += `\n\n== PROPERTY INVENTORY (${s.properties.length} total records) ==\n`;
        ctx += sample.map(p =>
          `Building: ${p.building||'?'} | Location: ${p.location||'?'} | Floor: ${p.floor||'?'} | ` +
          `Carpet: ${p.carpet||'?'} sqft | BUA: ${p.bua||'?'} sqft | Rent: ₹${p.rent||'?'}/sqft | ` +
          `Available: ${p.availability||'?'} | Condition: ${p.condition||'?'} | Landlord: ${p.landlord||'?'} | Contact: ${p.contact||'?'}`
        ).join('\n');
        if (s.properties.length > 40) ctx += `\n... and ${s.properties.length - 40} more records`;
      }

      if (s.contacts.length) {
        ctx += `\n\n== CONTACTS (${s.contacts.length} extracted) ==\n`;
        ctx += s.contacts.slice(0, 50).map(c =>
          `${c.name||'?'} | ${c.company||'?'} | ${c.role||'?'} | Ph: ${c.phone||'?'} | Email: ${c.email||'?'} | Building: ${c.building||'?'}`
        ).join('\n');
      }

      if (s.rawText.length) {
        ctx += `\n\n== ADDITIONAL TEXT ==\n`;
        s.rawText.forEach(r => { ctx += `\n[${r.filename}]:\n${r.text.slice(0, 1000)}...\n`; });
      }

      return ctx.slice(0, CONFIG.MAX_CONTEXT_CHARS);
    },

    // ── AUTO INSIGHTS ────────────────────────────────────────
    generateInsights: () => {
      const s = _data;
      const insights = [];

      if (s.properties.length > 0) {
        const avail = s.properties.filter(p =>
          p.availability && !['leased','occupied'].includes((p.availability+'').toLowerCase())
        ).length;
        insights.push(`🏢 ${avail} of ${s.properties.length} properties are currently available`);

        // Avg rent by location
        const rentMap = {};
        s.properties.forEach(p => {
          if (!p.location || !p.rent) return;
          const loc = (p.location+'').split(',')[0].trim();
          if (!rentMap[loc]) rentMap[loc] = [];
          const r = parseFloat(p.rent);
          if (!isNaN(r)) rentMap[loc].push(r);
        });
        const locs = Object.entries(rentMap).sort((a, b) => b[1].length - a[1].length).slice(0, 3);
        locs.forEach(([loc, rents]) => {
          const avg = Math.round(rents.reduce((a, b) => a + b, 0) / rents.length);
          insights.push(`💰 Avg rent in ${loc}: ₹${avg}/sqft (${rents.length} listings)`);
        });
      }

      if (s.leases.length > 0) {
        const exp2025 = s.leases.filter(l => {
          try { return new Date(l.endDate).getFullYear() === 2025; } catch { return false; }
        }).length;
        const exp2026 = s.leases.filter(l => {
          try { return new Date(l.endDate).getFullYear() === 2026; } catch { return false; }
        }).length;
        if (exp2025) insights.push(`⚠️ ${exp2025} lease(s) expiring in 2025 — renewal opportunities`);
        if (exp2026) insights.push(`📋 ${exp2026} lease(s) expiring in 2026 — track for deals`);
      }

      const opps = KnowledgeGraph.detectOpportunities();
      const underpriced = opps.filter(o => o.type === 'UNDERPRICED');
      if (underpriced.length) {
        insights.push(`💡 ${underpriced.length} property listing(s) priced below market avg — potential opportunities`);
      }

      return insights;
    },

    // ── RESET ────────────────────────────────────────────────
    reset: () => {
      _data = {
        properties: [], leases: [], tenants: [], contacts: [],
        deals: [], financials: [], rawText: [], fileIndex: {},
      };
      _idCounter = 1;
      try { localStorage.removeItem('nexus_kg_session'); } catch(e) {}
    },

    // ── LOCALSTORAGE PERSISTENCE ─────────────────────────────
    saveToLocal: () => {
      try {
        const payload = JSON.stringify({ data: _data, idCounter: _idCounter });
        localStorage.setItem('nexus_kg_session', payload);
      } catch(e) { console.warn('KG save failed:', e); }
    },

    loadFromLocal: () => {
      try {
        const raw = localStorage.getItem('nexus_kg_session');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!parsed.data || !parsed.data.fileIndex) return false;
        _data = parsed.data;
        _idCounter = parsed.idCounter || 1;
        return Object.keys(_data.fileIndex).length > 0;
      } catch(e) { console.warn('KG load failed:', e); return false; }
    },
  };
})();

window.KnowledgeGraph = KnowledgeGraph;
