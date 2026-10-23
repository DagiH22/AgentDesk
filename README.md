# AgentDesk

An AI-powered customer support and knowledge-base platform.

## Documentation & Architecture Guide
For the complete technical guide, folder structure, tools used, and existing features, see:
- [Architecture & Codebase Guide](docs/ARCHITECTURE.md)

## Quick Start
```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres & MinIO)
docker compose -f docker/docker-compose.yml up -d

# 3. Run database migrations
pnpm --filter @agentdesk/db db:migrate

# 4. Start development servers
pnpm dev
```
