-- A ticket may have one assignee: any verified user. NULL means unassigned.
ALTER TABLE tickets ADD COLUMN assignee_id BIGINT REFERENCES users(id);
CREATE INDEX tickets_assignee_idx ON tickets (assignee_id);
