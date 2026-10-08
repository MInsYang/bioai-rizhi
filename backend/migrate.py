"""Checksum-verified migrations, serialized with a PostgreSQL advisory lock."""
import hashlib
from pathlib import Path
from .db import connection

def migrate():
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(724091401)')
        conn.execute('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())')
        for path in sorted((Path(__file__).parent/'migrations').glob('*.sql')):
            sql=path.read_text();digest=hashlib.sha256(sql.encode()).hexdigest()
            old=conn.execute('SELECT checksum FROM schema_migrations WHERE name=%s',(path.name,)).fetchone()
            if old:
                if old['checksum']!=digest:raise RuntimeError('Applied migration checksum changed: '+path.name)
                continue
            conn.execute(sql)
            conn.execute('INSERT INTO schema_migrations(name,checksum) VALUES (%s,%s)',(path.name,digest))
            print('Applied',path.name)
if __name__=='__main__':migrate()
