-- Migration 0003 — Controlled data erasure (decision D5, two-person rule).
--
-- Flow: researcher-of-study (or admin) creates a request -> a DIFFERENT admin
-- approves -> an admin executes. Execution runs in ONE transaction that sets
-- status='executing', deletes the subject's learning/assessment data, then
-- sets status='executed'. The 'executing' window is never visible to other
-- connections, and only it unlocks the submitted-attempt delete guards.
-- Applied inside the runner's transaction: no BEGIN/COMMIT here.

CREATE TABLE erasure_requests(
 id TEXT PRIMARY KEY NOT NULL,
 subject_user_id TEXT NOT NULL,               -- no FK: request must outlive any later account removal
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 requested_by TEXT NOT NULL REFERENCES users(id),
 requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','executing','executed')),
 approved_by TEXT REFERENCES users(id),
 approved_at TEXT,
 executed_by TEXT REFERENCES users(id),
 executed_at TEXT,
 summary TEXT CHECK(summary IS NULL OR json_valid(summary)),
 CHECK(approved_by IS NULL OR approved_by <> requested_by),
 CHECK(status IN ('pending') OR approved_by IS NOT NULL),
 CHECK(status <> 'executed' OR (executed_by IS NOT NULL AND executed_at IS NOT NULL AND summary IS NOT NULL))
);
CREATE INDEX idx_erasure_subject ON erasure_requests(subject_user_id, status);
-- At most one open request per subject.
CREATE UNIQUE INDEX ux_erasure_open ON erasure_requests(subject_user_id)
 WHERE status IN ('pending','approved','executing');

CREATE TRIGGER erasure_identity_freeze
 BEFORE UPDATE OF id, subject_user_id, reason, requested_by, requested_at ON erasure_requests
 BEGIN SELECT RAISE(ABORT, 'Erasure request identity is immutable'); END;
CREATE TRIGGER erasure_status_flow BEFORE UPDATE OF status ON erasure_requests
 WHEN NOT ((OLD.status = 'pending'   AND NEW.status IN ('approved','rejected'))
        OR (OLD.status = 'approved'  AND NEW.status = 'executing')
        OR (OLD.status = 'executing' AND NEW.status = 'executed'))
 BEGIN SELECT RAISE(ABORT, 'Invalid erasure status transition'); END;
CREATE TRIGGER erasure_no_delete BEFORE DELETE ON erasure_requests
 BEGIN SELECT RAISE(ABORT, 'Erasure requests are permanent records'); END;

-- Re-create the 0002 delete guards with an erasure exception.
DROP TRIGGER freeze_attempt_delete;
CREATE TRIGGER freeze_attempt_delete BEFORE DELETE ON assessment_attempts
 WHEN OLD.submitted_at IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM study_participants p JOIN erasure_requests e ON e.subject_user_id = p.student_id
   WHERE p.id = OLD.participant_id AND e.status = 'executing')
 BEGIN SELECT RAISE(ABORT, 'Submitted attempt cannot be deleted'); END;

DROP TRIGGER response_delete_lock;
CREATE TRIGGER response_delete_lock BEFORE DELETE ON item_responses
 WHEN EXISTS(SELECT 1 FROM assessment_attempts WHERE id = OLD.attempt_id AND submitted_at IS NOT NULL)
  AND NOT EXISTS(
   SELECT 1 FROM assessment_attempts a JOIN study_participants p ON p.id = a.participant_id
   JOIN erasure_requests e ON e.subject_user_id = p.student_id
   WHERE a.id = OLD.attempt_id AND e.status = 'executing')
 BEGIN SELECT RAISE(ABORT, 'Attempt already submitted; responses are locked'); END;
