import hashlib,json,uuid
from pathlib import Path
from .db import connection,Jsonb,audit
from .identity import sync_aliases,resolve
ROOT=Path(__file__).resolve().parents[1]
NS=uuid.UUID('b5b62e53-9a2a-4dbf-9c95-e3366b875730')
def stable(key):return uuid.uuid5(NS,key)

def seed():
    cp=ROOT/'docs/bootstrap/bioai_company_registry_v1.json';sp=ROOT/'docs/bootstrap/bioai_source_registry_v1.json'
    cd=json.loads(cp.read_text());sd=json.loads(sp.read_text())
    if len(cd['companies'])!=cd['metadata']['record_count']:raise ValueError('seed count mismatch')
    if len({c['id'] for c in cd['companies']})!=len(cd['companies']):raise ValueError('duplicate seed slug')
    with connection() as conn:
        conn.execute('SELECT pg_advisory_xact_lock(724091402)')
        for name,profile in sd['polling_profiles'].items():
            conn.execute('INSERT INTO polling_profiles(id,ttl_hours) VALUES (%s,%s) ON CONFLICT DO NOTHING',(name,1 if name=='P0' else profile['ttl_hours']))
        for c in cd['companies']:
            cid=stable('company:'+c['id'])
            inserted=conn.execute('''INSERT INTO companies(id,slug,name_zh,name_en,aliases,track,region,focus,official_website,status,priority,include_in_company_wall,notes,seed_payload)
              VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(slug) DO NOTHING RETURNING id''',
              (cid,c['id'],c['name_zh'],c['name_en'],Jsonb(c['aliases']),c['track'],c['region'],Jsonb(c['focus']),c['website'],c['status'],c['priority'],c['include_in_company_wall'],c['notes'],Jsonb(c))).fetchone()
            if inserted:
                sync_aliases(conn,cid,c['name_zh'],c['name_en'],c['aliases'])
                audit(conn,'seed','import','company',cid,after=c)
                for kind,url in c['source_pages'].items():
                    if not url:continue
                    conn.execute('''INSERT INTO sources(id,company_id,name,source_type,url,poll_profile,enabled,adapter,config)
                      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',
                      (stable('source:'+c['id']+':'+url),cid,c['name_en']+' '+kind,kind,url,c['priority'],kind=='homepage','discover' if kind=='homepage' else 'html',Jsonb({'origin':'seed','identity_anchor':kind=='homepage','requires_verification':True})))
                for name in c['aliases']:
                    if any(w in c['notes'] for w in ['旧','历史','归一','更名']):
                        conn.execute("UPDATE company_aliases SET alias_type='historical_brand' WHERE company_id=%s AND alias=%s",(cid,name))
        for c in cd['companies']:
            if c['parent']:
                result=resolve(conn,c['parent']);parent=result['candidates'][0]['id'] if result['status']=='matched' else None
                conn.execute('''INSERT INTO company_identity_links(id,company_id,related_company_id,related_name,link_type,notes)
                  VALUES (%s,%s,%s,%s,'parent',%s) ON CONFLICT DO NOTHING''',(stable('parent:'+c['id']),stable('company:'+c['id']),parent,c['parent'],c['notes']))
                # Parent seed claims remain pending; don't silently establish legal ownership.
        for source in sd['public_sources']:
            # Null URLs are catalog entries, not runnable endpoints; retained in seed_imports.
            if not source['base_url']:continue
            conn.execute('''INSERT INTO sources(id,registry_key,name,source_type,url,poll_profile,config)
              VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING''',(stable('public:'+source['id']),source['id'],source['name'],source['type'],source['base_url'],source['poll_profile'],Jsonb({**source,'integration_status':'not_implemented'})))
        for path,data in [(cp,cd),(sp,sd)]:
            conn.execute('INSERT INTO seed_imports(filename,checksum,metadata) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING',(path.name,hashlib.sha256(path.read_bytes()).hexdigest(),Jsonb(data)))
        print('Companies:',conn.execute('SELECT count(*) n FROM companies').fetchone()['n'],'Sources:',conn.execute('SELECT count(*) n FROM sources').fetchone()['n'])
if __name__=='__main__':seed()
