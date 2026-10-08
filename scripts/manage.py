#!/usr/bin/env python3
"""Local management CLI. Reads only recognized keys from .env, never logs secrets."""
import argparse,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
def load_env():
    path=ROOT/'.env'
    if path.exists():
        for line in path.read_text().splitlines():
            k,sep,v=line.partition('=')
            if sep and k in ('DATABASE_URL','ADMIN_TOKEN','INGEST_SECRET'):os.environ.setdefault(k,v.strip())

def main():
    load_env();p=argparse.ArgumentParser();p.add_argument('command',choices=['create-local-db','migrate','seed','serve','worker','dispatch']);p.add_argument('--port',type=int,default=8000);args=p.parse_args()
    if args.command=='create-local-db':
        import psycopg
        from psycopg import sql
        from urllib.parse import urlsplit,urlunsplit
        url=urlsplit(os.environ['DATABASE_URL']);name=url.path.lstrip('/')
        if url.hostname not in ('localhost','127.0.0.1'):raise ValueError('Local database creation only')
        with psycopg.connect(urlunsplit(url._replace(path='/postgres')),autocommit=True) as conn:
            if not conn.execute('SELECT 1 FROM pg_database WHERE datname=%s',(name,)).fetchone():conn.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        print('Local database ready')
    elif args.command=='migrate':
        from backend.migrate import migrate;migrate()
    elif args.command=='seed':
        from backend.seed import seed;seed()
    elif args.command=='serve':
        import uvicorn;uvicorn.run('backend.app:app',host='127.0.0.1',port=args.port)
    elif args.command=='worker':
        from backend.worker import main;sys.argv=[sys.argv[0]];main()
    elif args.command=='dispatch':
        from backend.jobs import dispatch;print('Dispatched',len(dispatch()))
if __name__=='__main__':main()
