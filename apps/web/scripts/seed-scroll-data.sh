#!/usr/bin/env bash

set -euo pipefail

PROJECT_COUNT="${1:-20}"
STORIES_PER_PROJECT="${2:-40}"
DB_NAME="${DB_NAME:-tatsumaki-db}"
WRANGLER_CONFIG="${WRANGLER_CONFIG:-wrangler.dev.toml}"
PERSIST_TO="${PERSIST_TO:-.wrangler/state}"
SEED_PREFIX="${SEED_PREFIX:-seed-scroll}"
DEV_USER_ID="${DEV_USER_ID:-dev|local}"
DEV_USER_EMAIL="${DEV_USER_EMAIL:-dev@localhost}"

if ! [[ "$PROJECT_COUNT" =~ ^[0-9]+$ ]] || ! [[ "$STORIES_PER_PROJECT" =~ ^[0-9]+$ ]]; then
  echo "Usage: $0 [PROJECT_COUNT] [STORIES_PER_PROJECT]" >&2
  exit 1
fi

if (( PROJECT_COUNT < 1 )) || (( STORIES_PER_PROJECT < 1 )); then
  echo "PROJECT_COUNT and STORIES_PER_PROJECT must be >= 1" >&2
  exit 1
fi

echo "Seeding local D1 data for scroll check..."
echo "- projects: ${PROJECT_COUNT}"
echo "- stories per project: ${STORIES_PER_PROJECT}"

SQL_FILE="$(mktemp)"
trap 'rm -f "$SQL_FILE"' EXIT

cat > "$SQL_FILE" <<SQL
BEGIN TRANSACTION;

INSERT OR IGNORE INTO users (id, display_name, email, avatar_url)
VALUES ('${DEV_USER_ID}', 'Dev Local User', '${DEV_USER_EMAIL}', NULL);

UPDATE users
SET
  display_name = 'Dev Local User',
  email = '${DEV_USER_EMAIL}',
  updated_at = CURRENT_TIMESTAMP;

DELETE FROM stories
WHERE id LIKE '${SEED_PREFIX}-story-%';

DELETE FROM project_members
WHERE project_id LIKE '${SEED_PREFIX}-project-%';

DELETE FROM projects
WHERE id LIKE '${SEED_PREFIX}-project-%';

WITH RECURSIVE n(i) AS (
  SELECT 1
  UNION ALL
  SELECT i + 1 FROM n WHERE i < ${PROJECT_COUNT}
)
INSERT INTO projects (
  id,
  name,
  description,
  is_public,
  timezone,
  sprint_duration_days,
  point_scale_type,
  custom_point_scale,
  estimate_bugs,
  estimate_chores,
  iteration_start_day
)
SELECT
  printf('${SEED_PREFIX}-project-%03d', i),
  printf('Scroll Project %03d', i),
  'Seeded for local scroll verification',
  0,
  'Asia/Tokyo',
  14,
  'fibonacci',
  NULL,
  1,
  1,
  1
FROM n
;

WITH RECURSIVE n(i) AS (
  SELECT 1
  UNION ALL
  SELECT i + 1 FROM n WHERE i < ${PROJECT_COUNT}
)
INSERT INTO project_members (project_id, user_id, role)
SELECT printf('${SEED_PREFIX}-project-%03d', i), '${DEV_USER_ID}', 'owner'
FROM n
;

WITH RECURSIVE
project_numbers(p) AS (
  SELECT 1
  UNION ALL
  SELECT p + 1 FROM project_numbers WHERE p < ${PROJECT_COUNT}
),
story_numbers(s) AS (
  SELECT 1
  UNION ALL
  SELECT s + 1 FROM story_numbers WHERE s < ${STORIES_PER_PROJECT}
)
INSERT INTO stories (
  id,
  project_id,
  title,
  description,
  type,
  status,
  status_changed_at,
  completed_at,
  story_point,
  labels,
  requester_id,
  epic_id,
  iteration_id,
  release_date,
  is_icebox,
  position
)
SELECT
  printf('${SEED_PREFIX}-story-%03d-%04d', p, s),
  printf('${SEED_PREFIX}-project-%03d', p),
  printf('Scroll Story P%03d-%04d', p, s),
  printf('Auto seeded story %04d for project %03d', s, p),
  CASE (s % 4)
    WHEN 0 THEN 'feature'
    WHEN 1 THEN 'bug'
    WHEN 2 THEN 'chore'
    ELSE 'feature'
  END,
  CASE (s % 5)
    WHEN 0 THEN 'Unstarted'
    WHEN 1 THEN 'Started'
    WHEN 2 THEN 'Finished'
    WHEN 3 THEN 'Delivered'
    ELSE 'Accepted'
  END,
  CURRENT_TIMESTAMP,
  CASE WHEN (s % 5) = 4 THEN CURRENT_TIMESTAMP ELSE NULL END,
  CASE (s % 7)
    WHEN 0 THEN 1
    WHEN 1 THEN 2
    WHEN 2 THEN 3
    WHEN 3 THEN 5
    WHEN 4 THEN 8
    WHEN 5 THEN 0
    ELSE NULL
  END,
  json_array('seed', 'scroll'),
  '${DEV_USER_ID}',
  NULL,
  NULL,
  NULL,
  0,
  s
FROM project_numbers
CROSS JOIN story_numbers
;

COMMIT;
SQL

bun run wrangler d1 execute "$DB_NAME" \
  --local \
  --config "$WRANGLER_CONFIG" \
  --persist-to "$PERSIST_TO" \
  --file "$SQL_FILE"

echo "Seed complete."
echo "Example run with custom volume: bash scripts/seed-scroll-data.sh 30 60"
