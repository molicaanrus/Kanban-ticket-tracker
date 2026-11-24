# Ticket Tracker: notes for Claude

## Source of truth
Task: Hackathon_Ticketing_System_Requirements_v4_1. Follow it exactly. Out of scope: sprints, story points, roles, team membership, SSO, attachments, notifications, real-time updates, custom workflows.

## Stack
- Frontend: React 18 + Vite (client/)
- Backend: Node.js 22 + Express (server/), `pg`, Argon2id via hash-wasm, nodemailer
- Database: PostgreSQL 16 in its own container
- Tests: `node --test` against a real PostgreSQL test database

## Commands
- Start everything: `docker compose up --build` (repo root)
- Fresh database: `docker compose down -v`
- Run tests: `docker compose --profile test run --rm tests`
- Logs: `docker compose logs -f app`

## Domain rules
- Ticket type: bug | feature | fix. State: new | ready_for_implementation | in_progress | ready_for_acceptance | done.
- Backend validates every enum and reference. A ticket's epic is null or from the SAME team (composite FK + API check).
- Delete team with tickets/epics, or epic used by tickets: HTTP 409, no cascade. Delete ticket deletes its comments.
- modified_at changes only on a real change, never on comments. Board sorted by modified_at desc. Comments oldest first, immutable.
- Timestamps set by the server, UTC, ISO-8601.

## Auth rules
- Email trimmed, case-insensitive unique. Password >= 8 chars, Argon2id.
- Verification tokens: 24 h, single use, new token invalidates older unused ones. Success leads to login screen.
- Only sign-up, login, verify, resend, static files and health are public. No session tokens in URLs.

## Config and database
- All config via env vars; keep .env.example and README in sync. Never commit .env or secrets.
- Migrations run on startup. NO seed data.

## How to work
- Small vertical slices; run tests and show output. Do not add out-of-scope features.
