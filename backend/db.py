import os
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

@contextmanager
def connection():
    url=os.environ.get('DATABASE_URL')
    if not url:raise RuntimeError('DATABASE_URL is required')
    with psycopg.connect(url,row_factory=dict_row,connect_timeout=10) as conn:
        yield conn

def audit(conn,actor,action,kind,entity_id,before=None,after=None):
    import json
    encode=lambda v:Jsonb(json.loads(json.dumps(v,default=str))) if v is not None else None
    conn.execute('INSERT INTO audit_log(actor,action,entity_type,entity_id,before_value,after_value) VALUES (%s,%s,%s,%s,%s,%s)',(actor,action,kind,entity_id,encode(before),encode(after)))
