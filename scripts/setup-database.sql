-- SUPABASE DATABASE SCHEMA FOR RESEARCH FINDER
-- Secure schema with Row-Level Security (RLS) for data protection

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create saved_articles table with proper security
CREATE TABLE IF NOT EXISTS saved_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Article information
  article_id TEXT NOT NULL,
  article_title TEXT NOT NULL,
  article_doi TEXT,
  article_year INTEGER,
  article_source TEXT NOT NULL,
  article_abstract TEXT,
  article_authors JSONB,
  article_url TEXT,
  
  -- Metadata
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT unique_saved_article UNIQUE (user_id, article_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_articles_user_id ON saved_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_articles_saved_at ON saved_articles(saved_at DESC);

-- Enable Row Level Security (RLS) on saved_articles
ALTER TABLE saved_articles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own saved articles
CREATE POLICY "Users can view their own saved articles"
  ON saved_articles
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert articles for themselves
CREATE POLICY "Users can insert their own saved articles"
  ON saved_articles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own saved articles
CREATE POLICY "Users can update their own saved articles"
  ON saved_articles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own saved articles
CREATE POLICY "Users can delete their own saved articles"
  ON saved_articles
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create audit log table for security monitoring
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Enable RLS on audit logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins or the user themselves can view audit logs
CREATE POLICY "Users can view their own audit logs"
  ON audit_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
DROP TRIGGER IF EXISTS update_saved_articles_updated_at ON saved_articles;
CREATE TRIGGER update_saved_articles_updated_at
    BEFORE UPDATE ON saved_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to log actions for security
CREATE OR REPLACE FUNCTION log_audit_action(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
  VALUES (auth.uid(), p_action, p_resource_type, p_resource_id, p_details, p_ip_address);
END;
$$ LANGUAGE plpgsql;

-- Grant permissions (important for security)
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_articles TO authenticated;
GRANT SELECT ON saved_articles TO anon;
GRANT INSERT ON audit_logs TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
