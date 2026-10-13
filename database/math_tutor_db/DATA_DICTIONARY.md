# Từ điển dữ liệu SQLite

Tổng cộng 26 bảng. Đọc schema.sql để xem đầy đủ CHECK, khóa ngoại ghép, trigger và index.

## activity_events

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| session_id | TEXT | True | - | - |
| event_type | TEXT | True | - | - |
| occurred_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |

## ai_configs

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| provider | TEXT | True | - | - |
| model_name | TEXT | True | - | - |
| prompt_version | TEXT | True | - | - |
| parameters | TEXT | True | - | - |

## assessment_attempts

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| study_id | TEXT | True | - | - |
| assessment_id | TEXT | True | - | - |
| participant_id | TEXT | True | - | - |
| attempt_no | INTEGER | True | - | 1 |
| started_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |
| submitted_at | TEXT | False | - | - |

## assessment_items

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| assessment_id | TEXT | True | - | - |
| problem_id | TEXT | True | - | - |
| problem_version | INTEGER | True | - | - |
| position | INTEGER | True | - | - |
| max_solution_score | REAL | True | - | - |
| max_explanation_score | REAL | True | - | - |

## assessments

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| study_id | TEXT | True | - | - |
| title | TEXT | True | - | - |
| phase | TEXT | True | - | - |
| rubric_version | TEXT | True | - | - |

## assignment_problems

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| assignment_id | TEXT | True | 1 | - |
| problem_id | TEXT | True | 2 | - |
| problem_version | INTEGER | True | 3 | - |
| position | INTEGER | True | - | - |

## assignments

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| class_id | TEXT | True | - | - |
| creator_id | TEXT | True | - | - |
| title | TEXT | True | - | - |
| learning_mode | TEXT | True | - | - |
| due_at | TEXT | False | - | - |

## class_members

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| class_id | TEXT | True | 1 | - |
| student_id | TEXT | True | 2 | - |

## classes

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| teacher_id | TEXT | True | - | - |
| name | TEXT | True | - | - |
| school_year | TEXT | True | - | - |

## feedback_reports

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| message_id | TEXT | True | - | - |
| reporter_id | TEXT | True | - | - |
| reason | TEXT | True | - | - |
| status | TEXT | True | - | 'open' |
| resolution | TEXT | False | - | - |
| reviewer_id | TEXT | False | - | - |

## hint_events

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| session_id | TEXT | True | - | - |
| step_id | TEXT | False | - | - |
| hint_level | INTEGER | True | - | - |
| trigger | TEXT | True | - | - |
| content | TEXT | True | - | - |
| created_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |

## item_responses

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| attempt_id | TEXT | True | - | - |
| assessment_id | TEXT | True | - | - |
| item_id | TEXT | True | - | - |
| solution | TEXT | True | - | - |
| explanation | TEXT | True | - | '' |
| solution_score | REAL | False | - | - |
| explanation_score | REAL | False | - | - |
| grader_id | TEXT | False | - | - |

## learning_sessions

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| student_id | TEXT | True | - | - |
| problem_id | TEXT | True | - | - |
| problem_version | INTEGER | True | - | - |
| assignment_id | TEXT | False | - | - |
| ai_config_id | TEXT | False | - | - |
| learning_mode | TEXT | True | - | - |
| state | TEXT | True | - | 'READ_PROBLEM' |
| version | INTEGER | True | - | 0 |
| started_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |
| completed_at | TEXT | False | - | - |

## messages

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| session_id | TEXT | True | - | - |
| sender_type | TEXT | True | - | - |
| content | TEXT | True | - | - |
| ai_config_id | TEXT | False | - | - |
| created_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |

## problem_versions

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| problem_id | TEXT | True | 1 | - |
| version | INTEGER | True | 2 | - |
| statement | TEXT | True | - | - |
| math_spec | TEXT | True | - | - |
| teacher_solution | TEXT | True | - | - |
| hints | TEXT | True | - | - |
| difficulty | TEXT | True | - | - |
| approval_status | TEXT | True | - | 'draft' |
| approved_by | TEXT | False | - | - |
| approved_at | TEXT | False | - | - |

## problems

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| topic_id | TEXT | True | - | - |
| author_id | TEXT | True | - | - |

## roles

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| code | TEXT | True | 1 | - |

## schema_migrations

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| version | INTEGER | False | 1 | - |
| applied_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |

## solution_steps

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| session_id | TEXT | True | - | - |
| step_index | INTEGER | True | - | - |
| request_id | TEXT | True | - | - |
| previous_equation | TEXT | True | - | - |
| submitted_equation | TEXT | True | - | - |
| operation | TEXT | True | - | - |
| operation_value | TEXT | False | - | - |
| explanation | TEXT | True | - | '' |
| math_status | TEXT | True | - | - |
| error_code | TEXT | False | - | - |
| created_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |

## studies

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| title | TEXT | True | - | - |
| start_at | TEXT | False | - | - |
| end_at | TEXT | False | - | - |

## study_groups

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| study_id | TEXT | True | - | - |
| name | TEXT | True | - | - |
| condition | TEXT | True | - | - |

## study_participants

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| study_id | TEXT | True | - | - |
| group_id | TEXT | True | - | - |
| student_id | TEXT | True | - | - |
| participant_code | TEXT | True | - | - |

## study_researchers

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| study_id | TEXT | True | 1 | - |
| researcher_id | TEXT | True | 2 | - |

## topics

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| name | TEXT | True | - | - |
| grade | INTEGER | True | - | - |

## user_roles

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| user_id | TEXT | True | 1 | - |
| role_code | TEXT | True | 2 | - |

## users

| Cột | Kiểu | NOT NULL | Khóa chính | Mặc định |
|---|---|---|---|---|
| id | TEXT | True | 1 | - |
| auth_subject | TEXT | False | - | - |
| display_name | TEXT | True | - | - |
| status | TEXT | True | - | 'active' |
| created_at | TEXT | True | - | strftime('%Y-%m-%dT%H:%M:%fZ','now') |
