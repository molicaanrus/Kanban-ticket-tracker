-- Initial schema. Creates tables only: no users, teams, epics, tickets or comments are inserted.

CREATE TABLE users (
  id                BIGSERIAL PRIMARY KEY,
  email             TEXT NOT NULL,
  password_hash     TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- emails are compared case-insensitively
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  id         BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE email_verification_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX evt_user_idx ON email_verification_tokens (user_id);

CREATE TABLE teams (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teams_name_unique ON teams (lower(name));

CREATE TABLE epics (
  id          BIGSERIAL PRIMARY KEY,
  team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, team_id)
);
CREATE INDEX epics_team_idx ON epics (team_id);

CREATE TABLE tickets (
  id          BIGSERIAL PRIMARY KEY,
  team_id     BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'fix')),
  state       TEXT NOT NULL CHECK (state IN ('new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done')),
  epic_id     BIGINT,
  title       TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body        TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_by  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- the epic must belong to the same team as the ticket (enforced by the database itself)
  FOREIGN KEY (epic_id, team_id) REFERENCES epics (id, team_id) ON DELETE RESTRICT
);
CREATE INDEX tickets_board_idx ON tickets (team_id, modified_at DESC);
CREATE INDEX tickets_epic_idx ON tickets (epic_id);

CREATE TABLE comments (
  id         BIGSERIAL PRIMARY KEY,
  ticket_id  BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body       TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_ticket_idx ON comments (ticket_id, created_at);
