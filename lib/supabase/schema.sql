-- 删除旧表（按依赖顺序）
DROP TABLE IF EXISTS environments CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,
  avatar_url TEXT,
  api_key_encrypted TEXT,
  plan TEXT DEFAULT 'free',
  task_count_month INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 任务表
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  repo_owner TEXT,
  repo_name TEXT,
  branch TEXT DEFAULT 'main',
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending',
  logs JSONB DEFAULT '[]',
  diff TEXT,
  pr_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 环境配置表
CREATE TABLE environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  repo TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_environments_user_id ON environments(user_id);
CREATE INDEX idx_users_github_id ON users(github_id);

-- 启用行级安全
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE environments ENABLE ROW LEVEL SECURITY;

-- RLS 策略（基于 auth.uid() 匹配用户 id）
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can read own tasks" ON tasks
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own tasks" ON tasks
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can read own environments" ON environments
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own environments" ON environments
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);
