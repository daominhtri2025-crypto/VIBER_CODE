import argparse
from pathlib import Path
from db import connect

ROOT = Path(__file__).resolve().parent

def initialize(path, demo=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Never silently overwrite a user's existing database.
    with path.open('xb'):
        pass
    conn = connect(path)
    try:
        conn.executescript('BEGIN IMMEDIATE;\n' + (ROOT/'schema.sql').read_text(encoding='utf-8') + '\nCOMMIT;')
        with conn:
            conn.executemany('INSERT INTO roles(code) VALUES(?)', [(r,) for r in ('student','teacher','researcher','admin')])
        if demo:
            conn.executescript('BEGIN IMMEDIATE;\n' + (ROOT/'seed.sql').read_text(encoding='utf-8') + '\nCOMMIT;')
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
        conn.execute('PRAGMA journal_mode=WAL')
    finally:
        conn.close()
    return path

if __name__ == '__main__':
    ap=argparse.ArgumentParser(description='Create a new SQLite Math Tutor database. Requires SQLite >= 3.38.')
    ap.add_argument('--db', default='data/math_tutor.db')
    ap.add_argument('--demo', action='store_true')
    args=ap.parse_args()
    print(initialize(args.db,args.demo).resolve())
