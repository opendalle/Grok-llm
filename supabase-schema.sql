-- ═══════════════════════════════════════════════════
-- CRE Intelligence Hub — Supabase Schema
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  filename     TEXT,
  schema_type  TEXT,
  row_count    INTEGER,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge Graph table
CREATE TABLE IF NOT EXISTS knowledge_graph (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID REFERENCES sessions(id) ON DELETE CASCADE,
  properties   JSONB DEFAULT '[]',
  leases       JSONB DEFAULT '[]',
  tenants      JSONB DEFAULT '[]',
  contacts     JSONB DEFAULT '[]',
  file_index   JSONB DEFAULT '{}',
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id)
);

-- Queries / Chat History table
CREATE TABLE IF NOT EXISTS queries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES sessions(id) ON DELETE CASCADE,
  query_text    TEXT,
  intent        TEXT,
  response_text TEXT,
  source        TEXT DEFAULT 'grok',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Saved Deals table
CREATE TABLE IF NOT EXISTS saved_deals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID REFERENCES sessions(id) ON DELETE CASCADE,
  tenant      TEXT,
  property    TEXT,
  fit_score   INTEGER,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE files         ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE queries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_deals   ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (public app)
CREATE POLICY "allow_all" ON sessions      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON files         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON knowledge_graph FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON queries       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON saved_deals   FOR ALL USING (true) WITH CHECK (true);
