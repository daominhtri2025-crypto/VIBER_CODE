-- Parameters (:student_id, :class_id, :study_id) must be bound by the backend.
-- Check caller permissions before running reports. Views do not enforce access.

-- Student session history
SELECT * FROM session_summary WHERE student_id=:student_id;

-- Teacher class sessions
SELECT s.*,u.display_name FROM session_summary s
JOIN users u ON u.id=s.student_id
JOIN assignments a ON a.id=s.assignment_id WHERE a.class_id=:class_id;

-- Anonymous assessment results, constrained to authorized study
SELECT participant_code,condition,phase,total_score,graded_items,expected_items
FROM research_results WHERE study_id=:study_id;

-- Error distribution (unknown is separate from invalid)
SELECT error_code,count(*) AS occurrences FROM solution_steps
WHERE math_status='invalid' GROUP BY error_code;
