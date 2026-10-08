import unicodedata

def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKC',value).casefold() if c.isalnum())

def resolve(conn,name):
    rows=conn.execute('''SELECT c.id,c.slug,c.name_zh,c.name_en,c.status,c.parent_company_id,a.alias_type,a.verification_status
      FROM company_aliases a JOIN companies c ON c.id=a.company_id WHERE a.normalized=%s ORDER BY c.slug''',(normalize(name),)).fetchall()
    return {'query':name,'status':'matched' if len(rows)==1 else 'ambiguous' if rows else 'unresolved','candidates':rows}

def sync_aliases(conn,company_id,name_zh,name_en,aliases,verification='seed_unverified'):
    values=[(v,k) for v,k in [(name_zh,'name_zh'),(name_en,'name_en')]+[(a,'alias') for a in aliases] if v and normalize(v)]
    normalized=[normalize(v) for v,k in values]
    conn.execute('DELETE FROM company_aliases WHERE company_id=%s AND NOT(normalized=ANY(%s))',(company_id,normalized))
    for value,kind in values:
        conn.execute("""INSERT INTO company_aliases(company_id,alias,normalized,alias_type,verification_status)
          VALUES (%s,%s,%s,%s,%s) ON CONFLICT(company_id,normalized) DO NOTHING""",(company_id,value,normalize(value),kind,verification))
