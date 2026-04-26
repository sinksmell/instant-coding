-- Add codespaces table for managing GitHub Codespaces
CREATE TABLE codespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  codespace_name TEXT,
  machine_type TEXT DEFAULT 'basicLinux32gb',
  status TEXT DEFAULT 'Provisioning',
  web_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_codespaces_user_id ON codespaces(user_id);
