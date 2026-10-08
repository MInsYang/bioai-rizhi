import argparse,time,uuid,urllib.parse
from defusedxml import ElementTree as ET
from .db import connection,Jsonb
from .jobs import claim,owned,fail
from .fetching import fetch,check_robots
from .discovery import discover
from .parsing import parse_feed,parse_html
PARSER_VERSION='ingestion-v2'

def run_job(job):
    started=time.monotonic();metrics={}
    try:
        with connection() as conn:source=conn.execute('SELECT * FROM sources WHERE id=%s',(job['source_id'],)).fetchone()
        if not source['enabled'] or (source['adapter']!='discover' and not source['verified']):raise ValueError('Source is disabled or unverified')
        cursor_date=None
        if source['adapter'] in ('pubmed','biorxiv'):
            from .academic import collect
            from .fetching import Response
            records,metrics,cursor_date=collect(source)
            candidates=[]
            response=Response(source['url'],200,{},'',metrics['bytes_fetched'],0)
        else:
            check_robots(source['url'])
            headers={}
            if source['etag']:headers['If-None-Match']=source['etag']
            if source['last_modified']:headers['If-Modified-Since']=source['last_modified']
            response=fetch(source['url'],headers);metrics={'http_status':response.status,'bytes_fetched':response.bytes_fetched}
            if response.status not in (200,304):raise RuntimeError('Source HTTP '+str(response.status))
            candidates=[];records=[]
            if response.status==200:
                if source['adapter']=='discover':candidates=discover(response.body,response.url)
                elif source['adapter']=='rss':records=parse_feed(response.body,response.url)
                elif source['adapter']=='html':
                    records=parse_html(response.body,response.url);candidates=discover(response.body,response.url)
                elif source['adapter']=='sitemap':
                    root=ET.fromstring(response.body)
                    if root.tag.split('}')[-1] not in ('urlset','sitemapindex'):raise ValueError('Not a sitemap')
                    for el in root.iter():
                        if el.tag.split('}')[-1]=='loc' and el.text and len(candidates)<80:
                            candidates.append({'url':el.text.strip(),'source_type':'newsroom','name':'Sitemap URL','adapter':'html','platform':None,'provenance':{'discovered_on':response.url,'method':'sitemap'}})
                else:raise ValueError('Source adapter is not implemented')
        with connection() as conn:
            owned(conn,job)
            # Source may have been revoked while its request was in flight.
            current=conn.execute('SELECT * FROM sources WHERE id=%s FOR UPDATE',(source['id'],)).fetchone()
            if not current['enabled'] or (current['adapter']!='discover' and not current['verified']):raise ValueError('Source verification revoked')
            for item in candidates:
                if not source['company_id']:continue
                parsed=urllib.parse.urlsplit(item['url'])
                if parsed.scheme!='https' or parsed.username or parsed.password:continue
                conn.execute('''INSERT INTO sources(id,company_id,name,source_type,url,platform,poll_profile,adapter,config)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(company_id,url) DO NOTHING''',(uuid.uuid4(),source['company_id'],item['name'],item['source_type'],item['url'],item['platform'],source['poll_profile'],item['adapter'],Jsonb({'discovered_by':str(source['id']),'provenance':item['provenance'],'integration_status':'candidate'})))
            inserted=0
            for r in records:
                row=conn.execute('''INSERT INTO raw_items(id,source_id,job_id,external_id,canonical_url,published_at,title,raw_payload,content_text,content_hash)
                  VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(source_id,content_hash) DO NOTHING RETURNING id''',(uuid.uuid4(),source['id'],job['id'],r['external_id'],r['canonical_url'],r['published_at'],r['title'],Jsonb({**r['raw_payload'],'http_status':response.status,'fetched_url':response.url,'parser_version':PARSER_VERSION}),r['content_text'],r['content_hash'])).fetchone()
                inserted+=bool(row)
            conn.execute('''UPDATE sources SET last_success_at=now(),consecutive_failures=0,last_error=NULL,
              etag=COALESCE(%s,etag),last_modified=COALESCE(%s,last_modified) WHERE id=%s''',(response.headers.get('etag'),response.headers.get('last-modified'),source['id']))
            if cursor_date:
                conn.execute("UPDATE sources SET config=jsonb_set(config,'{cursor_date}',%s) WHERE id=%s",(Jsonb(cursor_date),source['id']))
            conn.execute("UPDATE ingestion_jobs SET status='succeeded',finished_at=now(),lease_token=NULL,lease_expires_at=NULL WHERE id=%s",(job['id'],))
            conn.execute('''UPDATE ingestion_attempts SET finished_at=now(),http_status=%s,duration_ms=%s,bytes_fetched=%s,parsed_count=%s,result=%s,parser_version=%s WHERE job_id=%s AND attempt=%s''',(response.status,int((time.monotonic()-started)*1000),response.bytes_fetched,len(records) or len(candidates),'not_modified' if response.status==304 else 'success',PARSER_VERSION,job['id'],job['attempts']))
        return {'status':'succeeded','raw_inserted':inserted,'candidates':len(candidates),'http_status':response.status}
    except Exception as error:
        metrics['duration_ms']=int((time.monotonic()-started)*1000)
        for key in ('http_status','bytes_fetched'):
            if hasattr(error,key):metrics[key]=getattr(error,key)
        try:fail(job,error,metrics)
        except RuntimeError:return {'status':'lease_lost','error':'Lease no longer owned'}
        return {'status':'failed','error':str(error)}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    worker_id='worker-'+str(uuid.uuid4())
    while True:
        job=claim(worker_id)
        if job:print(run_job(job),flush=True)
        elif args.once:print('No due jobs')
        if args.once:break
        if not job:time.sleep(3)
if __name__=='__main__':main()
