-- Migration 0005 — Phase 3: hybrid authentication, AI usage/quota, idempotent
-- HTTP results, assessment windows/publication.
-- Applied inside the runner's transaction: no BEGIN/COMMIT here.

------------------------------------------------------------------------------
-- 1. Hybrid authentication (decision 14/10/2026):
--    accounts are pre-created by teacher/admin; Google is only an additional
--    login for an EXISTING account (match on pre-registered email or explicit
--    link while logged in). No auto-provisioning.
------------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN email TEXT
 CHECK(email IS NULL OR (length(email) BETWEEN 3 AND 254 AND email = lower(email) AND instr(email, '@') > 1));
CREATE UNIQUE INDEX ux_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE user_credentials(
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
 username TEXT NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 64 AND username = lower(username)),
 password_hash TEXT NOT NULL CHECK(password_hash LIKE '$argon2id$%'),
 must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0, 1)),
 failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
 locked_until TEXT,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_identities(
 provider TEXT NOT NULL CHECK(provider IN ('google')),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 255),
 user_id TEXT NOT NULL REFERENCES users(id),
 email TEXT,
 linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(provider, subject),
 UNIQUE(provider, user_id)
);

-- Rotating refresh tokens; only a SHA-256 hash is stored. Reuse of a rotated
-- token revokes the whole family (theft detection).
CREATE TABLE refresh_tokens(
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id),
 family_id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 replaced_by TEXT
);
CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

------------------------------------------------------------------------------
-- 2. AI configuration activation + usage ledger (quota, budget, research).
--    ai_configs rows stay immutable (v1 trigger); activation is append-only.
------------------------------------------------------------------------------
CREATE TABLE ai_config_activations(
 id TEXT PRIMARY KEY NOT NULL,
 ai_config_id TEXT NOT NULL REFERENCES ai_configs(id),
 activated_by TEXT NOT NULL REFERENCES users(id),
 activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER freeze_ai_activation BEFORE UPDATE ON ai_config_activations
 BEGIN SELECT RAISE(ABORT, 'Activations are append-only'); END;

CREATE TABLE ai_usage(
 id TEXT PRIMARY KEY NOT NULL,
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 session_id TEXT REFERENCES learning_sessions(id),
 student_id TEXT NOT NULL,            -- internal quota key; never exported; erased with the student
 ai_config_id TEXT REFERENCES ai_configs(id),
 purpose TEXT NOT NULL CHECK(purpose IN ('step_feedback','hint','stage_feedback','verify_feedback')),
 outcome TEXT NOT NULL CHECK(outcome IN ('ok','fallback_invalid','fallback_timeout','fallback_error',
                                         'skipped_quota','skipped_budget','skipped_disabled','skipped_stale')),
 input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens >= 0),
 output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens >= 0),
 cost_usd REAL NOT NULL DEFAULT 0 CHECK(cost_usd >= 0),
 latency_ms INTEGER CHECK(latency_ms IS NULL OR latency_ms >= 0),
 detail TEXT CHECK(detail IS NULL OR length(detail) <= 500)
);
CREATE INDEX idx_ai_usage_student ON ai_usage(student_id, occurred_at);
CREATE INDEX idx_ai_usage_session ON ai_usage(session_id);
CREATE INDEX idx_ai_usage_time ON ai_usage(occurred_at);

------------------------------------------------------------------------------
-- 3. Idempotent HTTP results (decision D2, deferred from Phase 1): a retry with
--    the same (actor, route, request_id) and payload returns the stored body,
--    including AI-generated text; a different payload is a 409.
------------------------------------------------------------------------------
CREATE TABLE request_results(
 actor_id TEXT NOT NULL,
 route TEXT NOT NULL,
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 status_code INTEGER NOT NULL,
 response TEXT NOT NULL CHECK(json_valid(response)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(actor_id, route, request_id)
);

------------------------------------------------------------------------------
-- 4. Assessment window and result publication (handoff §7 GĐ3 item 8).
--    Separate 1:1 table instead of ALTER TABLE assessments: the v1 package and
--    its tests insert into assessments POSITIONALLY, so adding columns there
--    would break existing callers (found by the baseline-on-v2 tests).
------------------------------------------------------------------------------
CREATE TABLE assessment_schedules(
 assessment_id TEXT PRIMARY KEY NOT NULL REFERENCES assessments(id),
 opens_at TEXT,
 closes_at TEXT,
 results_published_at TEXT,
 CHECK(opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at)
);
CREATE TRIGGER assessment_publish_once BEFORE UPDATE OF results_published_at ON assessment_schedules
 WHEN OLD.results_published_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT, 'Results already published'); END;
