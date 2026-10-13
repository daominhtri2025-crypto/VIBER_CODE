PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE users(
 id TEXT PRIMARY KEY NOT NULL, auth_subject TEXT UNIQUE,
 display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE roles(code TEXT PRIMARY KEY NOT NULL CHECK(code IN ('student','teacher','researcher','admin')));
CREATE TABLE user_roles(user_id TEXT NOT NULL REFERENCES users(id), role_code TEXT NOT NULL REFERENCES roles(code), PRIMARY KEY(user_id,role_code));
CREATE TABLE classes(id TEXT PRIMARY KEY NOT NULL, teacher_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, school_year TEXT NOT NULL);
CREATE TABLE class_members(class_id TEXT NOT NULL REFERENCES classes(id), student_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(class_id,student_id));
CREATE TABLE topics(id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, grade INTEGER NOT NULL CHECK(grade BETWEEN 6 AND 9));
CREATE TABLE problems(id TEXT PRIMARY KEY NOT NULL, topic_id TEXT NOT NULL REFERENCES topics(id), author_id TEXT NOT NULL REFERENCES users(id));
-- Mỗi phiên bản duyệt là bất biến, phiên học luôn tham chiếu đúng phiên bản.
CREATE TABLE problem_versions(
 problem_id TEXT NOT NULL REFERENCES problems(id), version INTEGER NOT NULL CHECK(version>0),
 statement TEXT NOT NULL, math_spec TEXT NOT NULL CHECK(json_valid(math_spec)),
 teacher_solution TEXT NOT NULL, hints TEXT NOT NULL CHECK(json_valid(hints)),
 difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','medium','hard')),
 approval_status TEXT NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','approved')),
 approved_by TEXT REFERENCES users(id), approved_at TEXT,
 CHECK(approval_status='draft' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 PRIMARY KEY(problem_id,version)
);
CREATE TABLE assignments(
 id TEXT PRIMARY KEY NOT NULL, class_id TEXT NOT NULL REFERENCES classes(id), creator_id TEXT NOT NULL REFERENCES users(id),
 title TEXT NOT NULL, learning_mode TEXT NOT NULL CHECK(learning_mode IN ('guided','practice','independent')), due_at TEXT,
 UNIQUE(id,class_id)
);
CREATE TABLE assignment_problems(
 assignment_id TEXT NOT NULL REFERENCES assignments(id), problem_id TEXT NOT NULL, problem_version INTEGER NOT NULL,
 position INTEGER NOT NULL CHECK(position>0), PRIMARY KEY(assignment_id,problem_id,problem_version), UNIQUE(assignment_id,position),
 FOREIGN KEY(problem_id,problem_version) REFERENCES problem_versions(problem_id,version)
);
CREATE TABLE ai_configs(id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, model_name TEXT NOT NULL, prompt_version TEXT NOT NULL, parameters TEXT NOT NULL CHECK(json_valid(parameters)));
CREATE TABLE learning_sessions(
 id TEXT PRIMARY KEY NOT NULL, student_id TEXT NOT NULL REFERENCES users(id), problem_id TEXT NOT NULL, problem_version INTEGER NOT NULL,
 assignment_id TEXT REFERENCES assignments(id), ai_config_id TEXT REFERENCES ai_configs(id),
 learning_mode TEXT NOT NULL CHECK(learning_mode IN ('guided','practice','independent')),
 state TEXT NOT NULL DEFAULT 'READ_PROBLEM' CHECK(state IN ('READ_PROBLEM','IDENTIFY_KNOWLEDGE','PROPOSE_PLAN','SOLVE_STEP','VERIFY_RESULT','INDEPENDENT_PRACTICE','COMPLETED')),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), completed_at TEXT,
 CHECK((state='COMPLETED' AND completed_at IS NOT NULL) OR (state<>'COMPLETED' AND completed_at IS NULL)),
 FOREIGN KEY(problem_id,problem_version) REFERENCES problem_versions(problem_id,version),
 FOREIGN KEY(assignment_id,problem_id,problem_version) REFERENCES assignment_problems(assignment_id,problem_id,problem_version)
);
CREATE TABLE solution_steps(
 id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES learning_sessions(id), step_index INTEGER NOT NULL CHECK(step_index>0),
 request_id TEXT NOT NULL, previous_equation TEXT NOT NULL, submitted_equation TEXT NOT NULL,
 operation TEXT NOT NULL, operation_value TEXT, explanation TEXT NOT NULL DEFAULT '',
 math_status TEXT NOT NULL CHECK(math_status IN ('valid','invalid','unknown')), error_code TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(session_id,step_index), UNIQUE(session_id,request_id), UNIQUE(id,session_id)
);
CREATE TABLE hint_events(
 id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES learning_sessions(id), step_id TEXT,
 hint_level INTEGER NOT NULL CHECK(hint_level BETWEEN 1 AND 3), trigger TEXT NOT NULL CHECK(trigger IN ('student_request','system_offer')),
 content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 FOREIGN KEY(step_id,session_id) REFERENCES solution_steps(id,session_id)
);
CREATE TABLE messages(
 id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES learning_sessions(id),
 sender_type TEXT NOT NULL CHECK(sender_type IN ('student','assistant','teacher','system')),
 content TEXT NOT NULL, ai_config_id TEXT REFERENCES ai_configs(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE activity_events(
 id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES learning_sessions(id),
 event_type TEXT NOT NULL CHECK(event_type IN ('start','pause','resume','heartbeat','submit','finish')),
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE feedback_reports(
 id TEXT PRIMARY KEY NOT NULL, message_id TEXT NOT NULL REFERENCES messages(id), reporter_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
 resolution TEXT, reviewer_id TEXT REFERENCES users(id)
);
CREATE TABLE studies(id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, start_at TEXT, end_at TEXT, CHECK(end_at IS NULL OR start_at IS NULL OR end_at>=start_at));
CREATE TABLE study_researchers(study_id TEXT NOT NULL REFERENCES studies(id), researcher_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(study_id,researcher_id));
CREATE TABLE study_groups(id TEXT PRIMARY KEY NOT NULL, study_id TEXT NOT NULL REFERENCES studies(id), name TEXT NOT NULL, condition TEXT NOT NULL CHECK(condition IN ('ai_guided','comparison')), UNIQUE(id,study_id));
CREATE TABLE study_participants(
 id TEXT PRIMARY KEY NOT NULL, study_id TEXT NOT NULL REFERENCES studies(id), group_id TEXT NOT NULL, student_id TEXT NOT NULL REFERENCES users(id), participant_code TEXT NOT NULL,
 FOREIGN KEY(group_id,study_id) REFERENCES study_groups(id,study_id),
 UNIQUE(study_id,student_id), UNIQUE(study_id,participant_code), UNIQUE(id,study_id)
);
CREATE TABLE assessments(
 id TEXT PRIMARY KEY NOT NULL, study_id TEXT NOT NULL REFERENCES studies(id), title TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('pre','post','retention')), rubric_version TEXT NOT NULL, UNIQUE(id,study_id)
);
CREATE TABLE assessment_items(
 id TEXT PRIMARY KEY NOT NULL, assessment_id TEXT NOT NULL REFERENCES assessments(id), problem_id TEXT NOT NULL, problem_version INTEGER NOT NULL,
 position INTEGER NOT NULL CHECK(position>0), max_solution_score REAL NOT NULL CHECK(max_solution_score>=0), max_explanation_score REAL NOT NULL CHECK(max_explanation_score>=0),
 FOREIGN KEY(problem_id,problem_version) REFERENCES problem_versions(problem_id,version),
 UNIQUE(assessment_id,position), UNIQUE(id,assessment_id)
);
CREATE TABLE assessment_attempts(
 id TEXT PRIMARY KEY NOT NULL, study_id TEXT NOT NULL, assessment_id TEXT NOT NULL, participant_id TEXT NOT NULL,
 attempt_no INTEGER NOT NULL DEFAULT 1 CHECK(attempt_no>0),
 started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), submitted_at TEXT,
 FOREIGN KEY(assessment_id,study_id) REFERENCES assessments(id,study_id),
 FOREIGN KEY(participant_id,study_id) REFERENCES study_participants(id,study_id),
 UNIQUE(assessment_id,participant_id,attempt_no), UNIQUE(id,assessment_id)
);
CREATE TABLE item_responses(
 id TEXT PRIMARY KEY NOT NULL, attempt_id TEXT NOT NULL, assessment_id TEXT NOT NULL, item_id TEXT NOT NULL,
 solution TEXT NOT NULL, explanation TEXT NOT NULL DEFAULT '',
 solution_score REAL CHECK(solution_score>=0), explanation_score REAL CHECK(explanation_score>=0), grader_id TEXT REFERENCES users(id),
 FOREIGN KEY(attempt_id,assessment_id) REFERENCES assessment_attempts(id,assessment_id),
 FOREIGN KEY(item_id,assessment_id) REFERENCES assessment_items(id,assessment_id), UNIQUE(attempt_id,item_id),
 CHECK((solution_score IS NULL AND explanation_score IS NULL AND grader_id IS NULL) OR (solution_score IS NOT NULL AND explanation_score IS NOT NULL AND grader_id IS NOT NULL))
);

CREATE INDEX idx_sessions_student ON learning_sessions(student_id,started_at);
CREATE INDEX idx_sessions_assignment ON learning_sessions(assignment_id);
CREATE INDEX idx_messages_session ON messages(session_id,created_at);
CREATE INDEX idx_hints_session ON hint_events(session_id,created_at);
CREATE INDEX idx_events_session ON activity_events(session_id,occurred_at);
CREATE INDEX idx_steps_errors ON solution_steps(error_code,session_id);
CREATE INDEX idx_participant_student ON study_participants(student_id);

CREATE TRIGGER freeze_approved_problem_update BEFORE UPDATE ON problem_versions WHEN OLD.approval_status='approved'
 BEGIN SELECT RAISE(ABORT,'Approved problem version is immutable'); END;
CREATE TRIGGER freeze_approved_problem_delete BEFORE DELETE ON problem_versions WHEN OLD.approval_status='approved'
 BEGIN SELECT RAISE(ABORT,'Approved problem version is immutable'); END;
CREATE TRIGGER freeze_ai_config BEFORE UPDATE ON ai_configs
 BEGIN SELECT RAISE(ABORT,'Create a new AI config version instead'); END;
CREATE TRIGGER freeze_assignment_problem BEFORE UPDATE ON assignment_problems
 BEGIN SELECT RAISE(ABORT,'Recreate assignment mapping instead'); END;
CREATE TRIGGER freeze_assessment_item BEFORE UPDATE ON assessment_items
 BEGIN SELECT RAISE(ABORT,'Assessment item is immutable; create a new assessment'); END;
CREATE TRIGGER freeze_assignment_scope BEFORE UPDATE OF class_id,learning_mode ON assignments
 WHEN EXISTS(SELECT 1 FROM learning_sessions WHERE assignment_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'Assignment with sessions cannot change scope or mode'); END;

CREATE TRIGGER approved_assignment_problem BEFORE INSERT ON assignment_problems
 WHEN NOT EXISTS(SELECT 1 FROM problem_versions WHERE problem_id=NEW.problem_id AND version=NEW.problem_version AND approval_status='approved')
 BEGIN SELECT RAISE(ABORT,'Problem must be approved'); END;
CREATE TRIGGER approved_assessment_problem BEFORE INSERT ON assessment_items
 WHEN NOT EXISTS(SELECT 1 FROM problem_versions WHERE problem_id=NEW.problem_id AND version=NEW.problem_version AND approval_status='approved')
 BEGIN SELECT RAISE(ABORT,'Problem must be approved'); END;
CREATE TRIGGER check_session_insert BEFORE INSERT ON learning_sessions
 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM problem_versions WHERE problem_id=NEW.problem_id AND version=NEW.problem_version AND approval_status='approved') THEN RAISE(ABORT,'Problem must be approved') END;
 SELECT CASE WHEN NEW.assignment_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM assignments a JOIN class_members m ON m.class_id=a.class_id WHERE a.id=NEW.assignment_id AND m.student_id=NEW.student_id AND a.learning_mode=NEW.learning_mode
 ) THEN RAISE(ABORT,'Student membership or learning mode invalid') END;
 END;
CREATE TRIGGER freeze_session_identity BEFORE UPDATE OF student_id,problem_id,problem_version,assignment_id,learning_mode,ai_config_id ON learning_sessions
 BEGIN SELECT RAISE(ABORT,'Session identity is immutable'); END;
CREATE TRIGGER block_independent_hints BEFORE INSERT ON hint_events
 WHEN EXISTS(SELECT 1 FROM learning_sessions WHERE id=NEW.session_id AND (learning_mode='independent' OR state IN ('INDEPENDENT_PRACTICE','COMPLETED')))
 BEGIN SELECT RAISE(ABORT,'Hints are disabled in independent or completed sessions'); END;
CREATE TRIGGER freeze_hint_event BEFORE UPDATE ON hint_events
 BEGIN SELECT RAISE(ABORT,'Hint event is immutable'); END;
CREATE TRIGGER freeze_solution_step BEFORE UPDATE ON solution_steps
 BEGIN SELECT RAISE(ABORT,'Insert a new step instead of rewriting history'); END;

CREATE TRIGGER response_score_insert BEFORE INSERT ON item_responses
 WHEN NEW.solution_score>(SELECT max_solution_score FROM assessment_items WHERE id=NEW.item_id)
 OR NEW.explanation_score>(SELECT max_explanation_score FROM assessment_items WHERE id=NEW.item_id)
 BEGIN SELECT RAISE(ABORT,'Score exceeds item maximum'); END;
CREATE TRIGGER response_score_update BEFORE UPDATE ON item_responses
 WHEN NEW.solution_score>(SELECT max_solution_score FROM assessment_items WHERE id=NEW.item_id)
 OR NEW.explanation_score>(SELECT max_explanation_score FROM assessment_items WHERE id=NEW.item_id)
 BEGIN SELECT RAISE(ABORT,'Score exceeds item maximum'); END;

-- Aggregate each child independently: avoids multiplying hints by steps/messages.
CREATE VIEW session_summary AS
 SELECT s.id,s.student_id,s.problem_id,s.problem_version,s.assignment_id,s.learning_mode,s.state,
 (SELECT count(*) FROM solution_steps t WHERE t.session_id=s.id) AS step_count,
 (SELECT count(*) FROM solution_steps t WHERE t.session_id=s.id AND t.math_status='invalid') AS invalid_step_count,
 (SELECT count(*) FROM hint_events h WHERE h.session_id=s.id AND h.trigger='student_request') AS requested_hint_count,
 (SELECT count(*) FROM hint_events h WHERE h.session_id=s.id) AS total_hint_count,
 (SELECT max(hint_level) FROM hint_events h WHERE h.session_id=s.id) AS max_hint_level
 FROM learning_sessions s;
CREATE VIEW assessment_totals AS
 SELECT a.id AS attempt_id,a.assessment_id,a.participant_id,a.submitted_at,
 (SELECT count(*) FROM assessment_items i WHERE i.assessment_id=a.assessment_id) AS expected_items,
 (SELECT count(*) FROM item_responses r WHERE r.attempt_id=a.id) AS answered_items,
 (SELECT count(*) FROM item_responses r WHERE r.attempt_id=a.id AND r.solution_score IS NOT NULL) AS graded_items,
 CASE WHEN a.submitted_at IS NOT NULL
 AND (SELECT count(*) FROM assessment_items i WHERE i.assessment_id=a.assessment_id)>0
 AND (SELECT count(*) FROM item_responses r WHERE r.attempt_id=a.id AND r.solution_score IS NOT NULL)=(SELECT count(*) FROM assessment_items i WHERE i.assessment_id=a.assessment_id)
 THEN (SELECT sum(solution_score+explanation_score) FROM item_responses r WHERE r.attempt_id=a.id) ELSE NULL END AS total_score
 FROM assessment_attempts a;
CREATE VIEW research_results AS
 SELECT p.participant_code,g.condition,a.study_id,a.phase,t.attempt_id,t.total_score,t.expected_items,t.answered_items,t.graded_items
 FROM assessment_totals t JOIN assessment_attempts x ON x.id=t.attempt_id
 JOIN assessments a ON a.id=x.assessment_id JOIN study_participants p ON p.id=x.participant_id
 JOIN study_groups g ON g.id=p.group_id;
INSERT INTO schema_migrations(version) VALUES(1);
