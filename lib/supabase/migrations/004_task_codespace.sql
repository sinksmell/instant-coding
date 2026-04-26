-- Migration 004: Add codespace_id to tasks
ALTER TABLE tasks ADD COLUMN codespace_id UUID REFERENCES codespaces(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_codespace_id ON tasks(codespace_id);
