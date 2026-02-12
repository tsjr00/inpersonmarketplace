-- Knowledge Base / Help Articles
-- Stores FAQ and help content that admins can manage
-- Public users see published articles on the /help page

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id TEXT REFERENCES verticals(id) ON DELETE SET NULL,  -- null = global (all verticals)
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for public queries (published articles by category)
CREATE INDEX idx_knowledge_articles_published
  ON knowledge_articles(is_published, vertical_id, category, sort_order);

-- RLS
ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

-- Anyone can read published articles
DROP POLICY IF EXISTS "knowledge_articles_public_read" ON knowledge_articles;
CREATE POLICY "knowledge_articles_public_read" ON knowledge_articles
  FOR SELECT USING (is_published = true);

-- Admins can do everything (CRUD)
DROP POLICY IF EXISTS "knowledge_articles_admin_all" ON knowledge_articles;
CREATE POLICY "knowledge_articles_admin_all" ON knowledge_articles
  FOR ALL USING (
    (SELECT auth.uid()) IN (
      SELECT user_id FROM user_profiles WHERE 'admin' = ANY(roles)
    )
  );
