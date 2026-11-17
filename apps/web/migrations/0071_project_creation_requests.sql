CREATE TABLE project_creation_requests (
  project_id TEXT PRIMARY KEY,
  purchaser_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  checkout_request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (purchaser_user_id, idempotency_key)
);
