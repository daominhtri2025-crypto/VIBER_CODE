import sqlite3
import tempfile
import unittest
from pathlib import Path
from db import connect
from init_db import initialize
from session_repository import submit_step

class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.path=Path(self.tmp.name)/'test.db'
        initialize(self.path,True); self.c=connect(self.path)
    def tearDown(self):
        self.c.close(); self.tmp.cleanup()
    def rejects(self,sql,args=()):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.c: self.c.execute(sql,args)
    def test_integrity(self):
        self.assertEqual(self.c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
        self.assertEqual(self.c.execute('PRAGMA foreign_key_check').fetchall(),[])
    def test_missing_foreign_key(self):
        self.rejects("INSERT INTO class_members VALUES('class-demo','missing')")
    def test_frozen_problem(self):
        self.rejects("UPDATE problem_versions SET statement='changed' WHERE problem_id='p1'")
    def test_duplicate_step(self):
        self.rejects("INSERT INTO solution_steps SELECT 'other',session_id,step_index,'other-request',previous_equation,submitted_equation,operation,operation_value,explanation,math_status,error_code,created_at FROM solution_steps WHERE id='step-1'")
    def test_duplicate_request(self):
        self.rejects("INSERT INTO solution_steps SELECT 'other',session_id,3,request_id,previous_equation,submitted_equation,operation,operation_value,explanation,math_status,error_code,created_at FROM solution_steps WHERE id='step-1'")
    def test_hint_blocked(self):
        with self.c: self.c.execute("INSERT INTO learning_sessions(id,student_id,problem_id,problem_version,learning_mode) VALUES('ind','student-a','p2',1,'independent')")
        self.rejects("INSERT INTO hint_events(id,session_id,hint_level,trigger,content) VALUES('bad','ind',1,'student_request','hint')")
        with self.c: self.c.execute("UPDATE learning_sessions SET state='INDEPENDENT_PRACTICE' WHERE id='session-demo'")
        self.rejects("INSERT INTO hint_events(id,session_id,hint_level,trigger,content) VALUES('bad','session-demo',1,'student_request','hint')")
    def test_hint_wrong_session(self):
        with self.c: self.c.execute("INSERT INTO learning_sessions(id,student_id,problem_id,problem_version,learning_mode) VALUES('other','student-b','p1',1,'guided')")
        self.rejects("INSERT INTO hint_events(id,session_id,step_id,hint_level,trigger,content) VALUES('bad','other','step-1',1,'student_request','hint')")
    def test_membership(self):
        self.rejects("INSERT INTO learning_sessions(id,student_id,problem_id,problem_version,assignment_id,learning_mode) VALUES('bad','researcher-demo','p1',1,'assignment-demo','guided')")
    def test_assigned_problem(self):
        self.rejects("INSERT INTO learning_sessions(id,student_id,problem_id,problem_version,assignment_id,learning_mode) VALUES('bad','student-a','p2',1,'assignment-demo','guided')")
    def test_one_group_per_study(self):
        self.rejects("INSERT INTO study_participants VALUES('bad','study-demo','group-control','student-a','P003')")
    def test_cross_study_attempt(self):
        with self.c:
            self.c.execute("INSERT INTO studies(id,title) VALUES('other','Other')")
            self.c.execute("INSERT INTO assessments VALUES('other-test','other','Test','pre','v1')")
        self.rejects("INSERT INTO assessment_attempts(id,study_id,assessment_id,participant_id) VALUES('bad','other','other-test','participant-a')")
    def test_wrong_assessment_item(self):
        self.rejects("INSERT INTO item_responses VALUES('bad','attempt-a-pre','pre-demo','post-item','x=6','',NULL,NULL,NULL)")
    def test_score_maximum(self):
        self.rejects("UPDATE item_responses SET solution_score=8 WHERE id='response-a-pre'")
    def test_totals_not_inflated(self):
        row=self.c.execute("SELECT * FROM session_summary WHERE id='session-demo'").fetchone()
        self.assertEqual((row['step_count'],row['invalid_step_count'],row['requested_hint_count']),(2,1,1))
        self.assertEqual(self.c.execute('SELECT total_score FROM assessment_totals').fetchone()[0],10)
    def test_incomplete_total_null(self):
        with self.c: self.c.execute("UPDATE item_responses SET solution_score=NULL,explanation_score=NULL,grader_id=NULL")
        self.assertIsNone(self.c.execute('SELECT total_score FROM assessment_totals').fetchone()[0])
    def test_atomic_idempotent_submission(self):
        args=dict(actor_id='student-a',session_id='session-demo',expected_version=2,request_id='new-request',previous_equation='2*x=12',submitted_equation='x=6',operation='divide_both_sides',operation_value='2',explanation='Chia hai vế cho 2',math_status='valid')
        result=submit_step(self.c,**args); again=submit_step(self.c,**args)
        self.assertEqual(result['id'],again['id'])
        self.assertEqual(self.c.execute("SELECT version FROM learning_sessions WHERE id='session-demo'").fetchone()[0],3)
        args['request_id']='another'
        with self.assertRaises(ValueError): submit_step(self.c,**args)
        self.assertEqual(self.c.execute('SELECT count(*) FROM solution_steps').fetchone()[0],3)
    def test_owner_and_request_payload(self):
        args=dict(actor_id='student-b',session_id='session-demo',expected_version=2,request_id='request-1',previous_equation='2*x+5=17',submitted_equation='2*x=22',operation='subtract_both_sides',operation_value='5',explanation='Em trừ 5 ở hai vế',math_status='invalid')
        with self.assertRaises(PermissionError): submit_step(self.c,**args)
        args['actor_id']='student-a'; args['submitted_equation']='changed'
        with self.assertRaises(ValueError): submit_step(self.c,**args)
    def test_no_overwrite(self):
        with self.assertRaises(FileExistsError): initialize(self.path)

if __name__=='__main__': unittest.main(verbosity=2)
