# Ticket Tracker

A small Kanban-style ticket tracker: React single-page app, Node.js (Express) HTTP API, PostgreSQL database in its own container.

## Prerequisites

Docker with Docker Compose v2 (Docker Desktop on Windows/macOS, Docker Engine + Compose plugin on Linux). Nothing else is needed on the host: no Node.js, no PostgreSQL.

No Docker on your machine? Open this repository in **GitHub Codespaces** (Code → Codespaces → Create codespace). The default Codespaces image already includes Docker; run the commands below in its terminal and open the forwarded ports from the **Ports** tab.

## Start

From the repository root:

```bash
docker compose up --build
```

- Application: http://localhost:8080
- Mail inbox with verification emails (Mailpit): http://localhost:8025
- Health check: http://localhost:8080/api/health

The database starts empty: there is no seed data and no default user. Sign up, open the verification email in Mailpit, click the link, then log in.

Stop with `Ctrl+C`; `docker compose down` removes containers and `docker compose down -v` also deletes the database volume.

## Configuration

All settings are environment variables with working defaults. To override them copy `.env.example` to `.env` (it is git-ignored).

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_HOST` | `mailpit` | SMTP server for verification emails |
| `SMTP_PORT` | `1025` | SMTP port |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465) |
| `SMTP_USER`, `SMTP_PASS` | empty | SMTP login, if the server needs one |
| `SMTP_FROM` | `Ticket Tracker <no-reply@ticket-tracker.local>` | Sender address |
| `APP_BASE_URL` | empty (taken from the browser address) | Public URL used in verification links |
| `POSTGRES_PASSWORD` | empty | Password of the local database container. Empty means a random password is generated at first start and kept in the `secrets` Docker volume (nothing secret is committed). Upgrading from an older checkout? Run `docker compose down -v` once, so the database and its password are created together. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

### Using the DataArt SMTP relay

Create `.env`:

```
SMTP_HOST=relay1.dataart.com
SMTP_PORT=25
SMTP_SECURE=false
SMTP_FROM=Ticket Tracker <your.name@dataart.com>
```

then run `docker compose up --build` again. The relay is reachable only from the company network or VPN. Verification links are built from `APP_BASE_URL`.

## Tests

```bash
docker compose --profile test run --rm tests
```

The tests run against a real PostgreSQL database (`tracker_test`, created automatically) and cover: sign-up → email verification → login; token expiry (24 h), single use and invalidation by resend; authentication required on business endpoints; team/epic/ticket rules (409 on non-empty team and used epic, epic must belong to the ticket's team); the optional ticket assignee (verified users only, counts as a modification, filter); `modified_at` changes only on real changes; comments; board ordering and filters; empty database after migrations.

## Architecture

```
Browser (React SPA)  →  Node.js API (Express)  →  PostgreSQL 16
```

- `client/` – React + Vite SPA, built into static files and served by the API container.
- `server/` – REST API under `/api`, SQL migrations in `server/migrations` (applied automatically at start, once each).
- Passwords: Argon2id. Sessions: random token in an httpOnly cookie, only its SHA-256 hash is stored. Verification tokens are single-use, valid for 24 hours, stored hashed.
- Integrity is enforced in the database too (unique case-insensitive email/team name, composite foreign key that keeps a ticket's epic in the ticket's team, `RESTRICT` deletes).

## API overview

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup`, `/verify-email`, `/resend-verification`, `/login`, `/logout` | public (except logout) |
| GET | `/api/auth/me` | current user |
| GET/POST/PATCH/DELETE | `/api/teams[/:id]` | 409 when team has tickets or epics |
| GET/POST/PATCH/DELETE | `/api/epics[/:id]` | 409 when tickets use the epic |
| GET/POST/PATCH/DELETE | `/api/tickets[/:id]` | list needs `teamId`; filters `type`, `epicId`, `assigneeId` (id or `none`), `q`; optional `assigneeId` on create/update |
| GET | `/api/users` | verified users (`id`, `email`) a ticket can be assigned to |
| GET/POST | `/api/tickets/:id/comments` | oldest first |

## AI usage

See [AI-WORKFLOW.md](AI-WORKFLOW.md).
