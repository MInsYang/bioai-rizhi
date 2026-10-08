import os,sys,uuid
from pathlib import Path
import pytest,psycopg
from psycopg import sql
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from scripts.manage import load_env
load_env()
@pytest.fixture(scope='session',autouse=True)
def test_database():
    original=os.environ['DATABASE_URL'];url=urlsplit(original)
    if url.hostname not in ('127.0.0.1','localhost'):pytest.fail('Tests require local PostgreSQL; never run against production')
    name='bioai_test_'+uuid.uuid4().hex[:12];admin=urlunsplit(url._replace(path='/postgres'))
    with psycopg.connect(admin,autocommit=True) as c:c.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
    os.environ['DATABASE_URL']=urlunsplit(url._replace(path='/'+name));os.environ['ADMIN_TOKEN']='a'*40;os.environ['INGEST_SECRET']='b'*40
    from backend.migrate import migrate
    migrate()
    yield
    os.environ['DATABASE_URL']=original
    with psycopg.connect(admin,autocommit=True) as c:c.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))
@pytest.fixture(autouse=True)
def reset_data(test_database):
    from backend.db import connection
    from backend.seed import seed
    with connection() as c:c.execute('TRUNCATE polling_profiles,seed_imports,audit_log RESTART IDENTITY CASCADE')
    seed()
