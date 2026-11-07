CREATE TABLE oauth_consent_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  search TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_oauth_consent_nonces_expires_at ON oauth_consent_nonces (expires_at);
