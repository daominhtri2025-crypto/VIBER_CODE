"""Trusted backend repository. Math validation is supplied by MathChecker upstream."""
import uuid

def submit_step(conn, *, actor_id, session_id, expected_version, request_id,
                previous_equation, submitted_equation, operation, explanation,
                math_status, operation_value=None, error_code=None):
    if conn.in_transaction:
        raise RuntimeError('submit_step owns its transaction')
    conn.execute('BEGIN IMMEDIATE')
    try:
        session=conn.execute('SELECT * FROM learning_sessions WHERE id=?',(session_id,)).fetchone()
        if not session or session['student_id']!=actor_id:
            raise PermissionError('Session access denied')
        active=conn.execute("SELECT 1 FROM users WHERE id=? AND status='active'",(actor_id,)).fetchone()
        if not active:
            raise PermissionError('User disabled')
        prior=conn.execute('SELECT * FROM solution_steps WHERE session_id=? AND request_id=?',(session_id,request_id)).fetchone()
        payload=dict(previous_equation=previous_equation,submitted_equation=submitted_equation,operation=operation,operation_value=operation_value,explanation=explanation,math_status=math_status,error_code=error_code)
        if prior:
            if any(prior[k]!=v for k,v in payload.items()):
                raise ValueError('Request id reused with different payload')
            conn.commit(); return dict(prior)
        if session['state']!='SOLVE_STEP':
            raise ValueError('Session is not accepting solution steps')
        if session['version']!=expected_version:
            raise ValueError('Session version conflict')
        step_index=conn.execute('SELECT coalesce(max(step_index),0)+1 FROM solution_steps WHERE session_id=?',(session_id,)).fetchone()[0]
        step_id=str(uuid.uuid4())
        conn.execute('INSERT INTO solution_steps(id,session_id,step_index,request_id,previous_equation,submitted_equation,operation,operation_value,explanation,math_status,error_code) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                     (step_id,session_id,step_index,request_id,previous_equation,submitted_equation,operation,operation_value,explanation,math_status,error_code))
        conn.execute('UPDATE learning_sessions SET version=version+1 WHERE id=? AND version=?',(session_id,expected_version))
        row=conn.execute('SELECT * FROM solution_steps WHERE id=?',(step_id,)).fetchone()
        conn.commit(); return dict(row)
    except Exception:
        conn.rollback(); raise
