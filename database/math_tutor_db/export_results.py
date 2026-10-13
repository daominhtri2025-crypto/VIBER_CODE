import argparse
import csv
from db import connect

def export(db,study_id,path):
    # Local administrator utility. In the web API, verify study_researchers first.
    with connect(db) as conn:
        rows=conn.execute('SELECT participant_code,condition,phase,attempt_id,total_score,expected_items,answered_items,graded_items FROM research_results WHERE study_id=? ORDER BY participant_code,phase,attempt_id',(study_id,))
        with open(path,'w',newline='',encoding='utf-8-sig') as out:
            writer=csv.writer(out); writer.writerow([d[0] for d in rows.description]); writer.writerows(rows)

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--db',default='data/math_tutor.db'); p.add_argument('--study',required=True); p.add_argument('--out',default='results.csv')
    a=p.parse_args(); export(a.db,a.study,a.out); print(a.out)
