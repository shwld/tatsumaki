ALTER TABLE users ADD COLUMN access_status TEXT NOT NULL DEFAULT 'pending';

UPDATE users SET access_status = 'allowed';

ALTER TABLE project_invitations ADD COLUMN token_hash TEXT;

CREATE UNIQUE INDEX project_invitations_token_hash_unique
  ON project_invitations(token_hash)
  WHERE token_hash IS NOT NULL;
