// ═══════════════════════════════════════════════════════════
// queryRouter.js — Intent Detection & Query Routing
// ═══════════════════════════════════════════════════════════

const QueryRouter = (() => {

  // ── INTENT DETECTION ────────────────────────────────────
  const detectIntent = (query) => {
    const q = query.toLowerCase();

    if (/find|show|list|available|search|propert|unit|office|space/.test(q))
      return 'PROPERTY_SEARCH';
    if (/match|suggest|recommend|requirement|need|looking for|fit/.test(q))
      return 'DEAL_MATCHING';
    if (/expir|renew|vacating|lock.in|notice period|upcoming/.test(q))
      return 'LEASE_EXPIRY';
    if (/market|trends|benchmark|compare|analysis|report|micro.market|avg|average rent/.test(q))
      return 'MARKET_INTEL';
    if (/contact|who to call|phone|email|poc|spoc|landlord name|developer/.test(q))
      return 'CONTACT_EXTRACT';
    if (/generate report|create summary|export|brief|pitch|proposal/.test(q))
      return 'REPORT_GEN';
    if (/opportunit|underpriced|distress|below market|flag|deal alert/.test(q))
      return 'OPPORTUNITY';
    if (/across files|compare files|both database|all file|cross file/.test(q))
      return 'CROSS_FILE';
    return 'GENERAL';
  };

  // ── CONTEXT BUILDER ──────────────────────────────────────
  const buildContext = (intent) => {
    const stats = KnowledgeGraph.stats();          // ← FIXED: call as function
    if (stats.files === 0) return '';
    return KnowledgeGraph.buildContextSummary(query);
  };

  // ── PREPARE ROUTE (used by streaming path in app.js) ────
  const prepareRoute = (query) => {
    const intent = detectIntent(query);
    const context = buildContext(intent);
    return { intent, context };
  };

  // ── QUICK LOCAL ANSWERS (no API needed) ─────────────────
  const tryLocalAnswer = (intent, query) => {
    if (GrokClient.hasKey()) return null;        // ← FIXED: hasKey() as function
    return GrokClient.localFallback(query);
  };

  // ── ROUTE ────────────────────────────────────────────────
  const route = async (query) => {
    const intent = detectIntent(query);
    const context = buildContext(intent);

    const enrichedQuery = `${query}\n\n[Intent: ${intent}]`;

    if (GrokClient.hasKey()) {                   // ← FIXED: hasKey() as function
      const reply = await GrokClient.send(enrichedQuery, context);
      return { intent, reply, source: 'grok' };
    }

    const localReply = GrokClient.localFallback(query);
    return { intent, reply: localReply, source: 'local' };
  };

  return { detectIntent, route, buildContext, prepareRoute };
})();

window.QueryRouter = QueryRouter;
