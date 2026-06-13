-- Indexes for columns touched by the account-deletion cascade batch.
-- These are scanned on every DELETE /auth/me call; without them each
-- statement requires a full-table scan.

CREATE INDEX IF NOT EXISTS idx_story_timeline_entries_actor_user_id
  ON story_timeline_entries(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_actor_user_id
  ON notifications(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_project_api_keys_owner_user_id
  ON project_api_keys(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_project_invitations_inviter_user_id
  ON project_invitations(inviter_user_id);

CREATE INDEX IF NOT EXISTS idx_project_invitations_target_user_id
  ON project_invitations(target_user_id);

CREATE INDEX IF NOT EXISTS idx_project_invitations_accepted_by_user_id
  ON project_invitations(accepted_by_user_id);
