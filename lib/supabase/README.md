# Supabase Schema & Migrations

## Current Schema (Latest)

See [`schema.sql`](../schema.sql) for the current full DDL.

### Tables

| Table | Purpose |
|-------|---------|
| `users` | GitHub OAuth users, API keys, profile |
| `tasks` | Coding tasks submitted by users |
| `environments` | User-configured repo environments |

### Key Fields

**users**
- `github_id` (BIGINT, unique) - GitHub user ID
- `anthropic_api_key` (TEXT) - Claude API key (BYOK)
- `anthropic_base_url` (TEXT) - Optional API proxy URL

**tasks**
- `status` - pending | running | completed | failed
- `logs` (JSONB) - Execution logs
- `diff` (TEXT) - Code diff output
- `pr_url` (TEXT) - Created PR link

## How to Apply

### Fresh Install (new project)

Run the full [`schema.sql`](../schema.sql) in Supabase SQL Editor.

### Upgrade from Previous Version

Apply migrations in order. Check which ones you need based on your current schema:

| Your current state | Run these migrations |
|--------------------|----------------------|
| No tables yet | Run `schema.sql` directly |
| Has `plan` and `task_count_month` columns | `001_remove_paywall.sql` then `002_api_key_config.sql` |
| Has `api_key_encrypted` column | `002_api_key_config.sql` only |
| Has `anthropic_api_key` column | Already up to date |

### Migration Files

| File | Description |
|------|-------------|
| [`000_init.sql`](./000_init.sql) | Initial schema with paywall fields |
| [`001_remove_paywall.sql`](./001_remove_paywall.sql) | Remove plan/task_count_month |
| [`002_api_key_config.sql`](./002_api_key_config.sql) | Rename api_key → anthropic_api_key, add anthropic_base_url |
