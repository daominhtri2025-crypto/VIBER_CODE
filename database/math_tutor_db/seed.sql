-- Synthetic users only. No real students, passwords or API secrets.
INSERT INTO users(id,display_name) VALUES
 ('teacher-demo','Giáo viên mẫu'),('student-a','Học sinh mẫu A'),('student-b','Học sinh mẫu B'),('researcher-demo','Người nghiên cứu mẫu'),('admin-demo','Quản trị mẫu');
INSERT INTO user_roles VALUES ('teacher-demo','teacher'),('teacher-demo','researcher'),('student-a','student'),('student-b','student'),('researcher-demo','researcher'),('admin-demo','admin');
INSERT INTO classes VALUES('class-demo','teacher-demo','Lớp thực nghiệm mẫu','2026–2027');
INSERT INTO class_members VALUES('class-demo','student-a'),('class-demo','student-b');
INSERT INTO topics VALUES('linear-equations','Phương trình bậc nhất một ẩn',8);
INSERT INTO problems VALUES('p1','linear-equations','teacher-demo'),('p2','linear-equations','teacher-demo'),('p3','linear-equations','teacher-demo');
INSERT INTO problem_versions VALUES
 ('p1',1,'Giải phương trình 2x + 5 = 17','{"variable":"x","domain":"R","lhs":"2*x+5","rhs":"17"}','Trừ 5 hai vế được 2x=12. Chia hai vế cho 2 được x=6. Thay vào: 2*6+5=17.',
 '["Em muốn giữ lại số hạng nào ở vế trái?","Nhớ thực hiện cùng phép toán ở cả hai vế.","Em thử trừ 5 ở cả hai vế rồi tự tính."]','easy','approved','teacher-demo','2026-10-13T04:00:00Z'),
 ('p2',1,'Giải phương trình 3x - 4 = 11','{"variable":"x","domain":"R","lhs":"3*x-4","rhs":"11"}','Cộng 4 hai vế được 3x=15. Chia hai vế cho 3 được x=5.',
 '["Làm thế nào loại bỏ số hạng -4?","Em cần cộng cùng một số vào hai vế.","Hãy thử cộng 4 vào cả hai vế."]','easy','approved','teacher-demo','2026-10-13T04:00:00Z'),
 ('p3',1,'Giải phương trình 4x + 3 = 2x + 15','{"variable":"x","domain":"R","lhs":"4*x+3","rhs":"2*x+15"}','Trừ 2x hai vế, trừ 3 hai vế được 2x=12, suy ra x=6.',
 '["Em có thể đưa các số hạng chứa x về cùng một vế như thế nào?","Thực hiện cùng phép toán ở cả hai vế.","Thử trừ 2x ở cả hai vế."]','medium','approved','teacher-demo','2026-10-13T04:00:00Z');
INSERT INTO assignments VALUES('assignment-demo','class-demo','teacher-demo','Luyện phương trình','guided',NULL);
INSERT INTO assignment_problems VALUES('assignment-demo','p1',1,1),('assignment-demo','p3',1,2);
INSERT INTO ai_configs VALUES('ai-config-demo','placeholder','not-configured','tutor-v1','{"max_hint_level":3}');
INSERT INTO learning_sessions(id,student_id,problem_id,problem_version,assignment_id,ai_config_id,learning_mode,state)
 VALUES('session-demo','student-a','p1',1,'assignment-demo','ai-config-demo','guided','SOLVE_STEP');
INSERT INTO solution_steps(id,session_id,step_index,request_id,previous_equation,submitted_equation,operation,operation_value,explanation,math_status)
 VALUES('step-1','session-demo',1,'request-1','2*x+5=17','2*x=22','subtract_both_sides','5','Em trừ 5 ở hai vế','invalid');
UPDATE learning_sessions SET version=1 WHERE id='session-demo';
INSERT INTO hint_events(id,session_id,step_id,hint_level,trigger,content) VALUES('hint-1','session-demo','step-1',1,'student_request','Em kiểm tra lại phép tính 17 - 5 nhé.');
INSERT INTO solution_steps(id,session_id,step_index,request_id,previous_equation,submitted_equation,operation,operation_value,explanation,math_status)
 VALUES('step-2','session-demo',2,'request-2','2*x+5=17','2*x=12','subtract_both_sides','5','17 trừ 5 bằng 12','valid');
UPDATE learning_sessions SET version=2 WHERE id='session-demo';
INSERT INTO messages(id,session_id,sender_type,content,ai_config_id) VALUES('message-demo','session-demo','assistant','Bước này đúng. Em sẽ làm gì tiếp theo để tìm x?','ai-config-demo');
INSERT INTO activity_events(id,session_id,event_type) VALUES('event-demo','session-demo','start');
INSERT INTO studies VALUES('study-demo','Thực nghiệm mẫu',NULL,NULL);
INSERT INTO study_researchers VALUES('study-demo','researcher-demo'),('study-demo','teacher-demo');
INSERT INTO study_groups VALUES('group-ai','study-demo','Nhóm AI','ai_guided'),('group-control','study-demo','Nhóm so sánh','comparison');
INSERT INTO study_participants VALUES('participant-a','study-demo','group-ai','student-a','P001'),('participant-b','study-demo','group-control','student-b','P002');
INSERT INTO assessments VALUES('pre-demo','study-demo','Kiểm tra trước','pre','rubric-v1'),('post-demo','study-demo','Kiểm tra sau','post','rubric-v1');
INSERT INTO assessment_items VALUES('pre-item','pre-demo','p2',1,1,7,3),('post-item','post-demo','p3',1,1,7,3);
INSERT INTO assessment_attempts(id,study_id,assessment_id,participant_id,submitted_at) VALUES('attempt-a-pre','study-demo','pre-demo','participant-a','2026-10-13T04:00:00Z');
INSERT INTO item_responses VALUES('response-a-pre','attempt-a-pre','pre-demo','pre-item','x=5','Cộng 4 hai vế rồi chia hai vế cho 3',7,3,'teacher-demo');
