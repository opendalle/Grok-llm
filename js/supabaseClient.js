// supabaseClient.js — Supabase Integration | Nexus Asia CRE Intelligence Hub
const SupabaseClient = (() => {
  let client = null;
  let sessionId = null;

  // ── INIT ────────────────────────────────────────────────────────────────
  const init = () => {
    if (!CONFIG.ENABLE_SUPABASE || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY) {
      console.log('Supabase disabled or keys missing. Running in local-only mode.');
      return false;
    }
    try {
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      sessionId = localStorage.getItem('nexus_session_id') || crypto.randomUUID();
      localStorage.setItem('nexus_session_id', sessionId);
      console.log('✅ Supabase connected. Session:', sessionId);
      return true;
    } catch (e) {
      console.error('Supabase init failed:', e);
      return false;
    }
  };

  const isReady = () => !!client;

  // ── SAVE SESSION ────────────────────────────────────────────────────────
  const saveSession = async (knowledgeGraph, fileIndex) => {
    if (!isReady()) return;
    try {
      await client.from('sessions').upsert({
        id: sessionId,
        updated_at: new Date().toISOString(),
      });
      await client.from('knowledge_graph').upsert({
        session_id: sessionId,
        properties: knowledgeGraph.properties || [],
        leases: knowledgeGraph.leases || [],
        tenants: knowledgeGraph.tenants || [],
        contacts: knowledgeGraph.contacts || [],
        file_index: fileIndex || {},
        updated_at: new Date().toISOString(),
      });
      console.log('✅ Session saved to Supabase');
    } catch (e) {
      console.error('Supabase saveSession error:', e);
    }
  };

  // ── LOAD SESSION ────────────────────────────────────────────────────────
  const loadSession = async () => {
    if (!isReady()) return null;
    try {
      const { data, error } = await client
        .from('knowledge_graph')
        .select('*')
        .eq('session_id', sessionId)
        .single();
      if (error || !data) return null;
      return data;
    } catch (e) {
      console.error('Supabase loadSession error:', e);
      return null;
    }
  };

  // ── LOG QUERY ────────────────────────────────────────────────────────────
  const logQuery = async (queryText, intent, responseText, source) => {
    if (!isReady()) return;
    try {
      await client.from('queries').insert({
        session_id: sessionId,
        query_text: queryText,
        intent: intent,
        response_text: responseText?.slice(0, 4000),
        source: source || 'grok',
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Supabase logQuery error:', e);
    }
  };

  // ── SAVE DEAL ────────────────────────────────────────────────────────────
  const saveDeal = async (tenant, property, fitScore, notes) => {
    if (!isReady()) return;
    try {
      const { data } = await client.from('saved_deals').insert({
        session_id: sessionId,
        tenant: tenant,
        property: property,
        fit_score: fitScore,
        notes: notes || '',
        created_at: new Date().toISOString(),
      }).select().single();
      return data;
    } catch (e) {
      console.error('Supabase saveDeal error:', e);
    }
  };

  // ── GET SAVED DEALS ──────────────────────────────────────────────────────
  const getSavedDeals = async () => {
    if (!isReady()) return [];
    try {
      const { data } = await client
        .from('saved_deals')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });
      return data || [];
    } catch (e) {
      console.error('Supabase getSavedDeals error:', e);
      return [];
    }
  };

  // ── GET QUERY HISTORY ────────────────────────────────────────────────────
  const getQueryHistory = async (limit = 50) => {
    if (!isReady()) return [];
    try {
      const { data } = await client
        .from('queries')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return data || [];
    } catch (e) {
      console.error('Supabase getQueryHistory error:', e);
      return [];
    }
  };

  // ── REGISTER FILE ────────────────────────────────────────────────────────
  const registerFile = async (filename, schemaType, rowCount) => {
    if (!isReady()) return;
    try {
      await client.from('files').upsert({
        session_id: sessionId,
        filename: filename,
        schema_type: schemaType,
        row_count: rowCount,
        processed_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Supabase registerFile error:', e);
    }
  };

  return { init, isReady, saveSession, loadSession, logQuery, saveDeal, getSavedDeals, getQueryHistory, registerFile, getSessionId: () => sessionId };
})();

window.SupabaseClient = SupabaseClient;
