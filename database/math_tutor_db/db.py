"""Database connection for trusted backend code, not a public authentication API."""
import sqlite3

def connect(path):
    conn = sqlite3.connect(str(path), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=5000')
    return conn

def backup(source, target):
    """Use SQLite backup API, never copy a live WAL database file alone."""
    with connect(source) as src, sqlite3.connect(str(target)) as dst:
        src.backup(dst)
