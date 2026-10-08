"""Bounded public metadata adapters. Preserve identifiers and original metadata, not inferred review claims."""
import datetime as dt
import json
import hashlib
import calendar
import time
import urllib.parse
from defusedxml import ElementTree as ET
from .fetching import fetch
from .parsing import record, timestamp

PUBMED_QUERY='("machine learning"[Title/Abstract] OR "deep learning"[Title/Abstract] OR "foundation model"[Title/Abstract]) AND ("single cell"[Title/Abstract] OR genomics[Title/Abstract] OR "drug discovery"[Title/Abstract] OR "protein design"[Title/Abstract])'
TOPICS=('machine learning','deep learning','foundation model','language model','protein design','virtual cell','generative model','artificial intelligence')

def academic_record(*args):
    row=record(*args)
    # Version and metadata corrections must survive even when the abstract is unchanged.
    stable=json.dumps([row['content_hash'],row['external_id'],row['raw_payload']['academic']],sort_keys=True,ensure_ascii=False)
    row['content_hash']=hashlib.sha256(stable.encode()).hexdigest()
    return row


def parse_pubmed(body):
    root=ET.fromstring(body)
    if root.tag!='PubmedArticleSet': raise ValueError('Invalid PubMed response')
    out=[]
    for a in root.findall('PubmedArticle'):
        def text(path):
            el=a.find(path)
            return ''.join(el.itertext()).strip() if el is not None else ''
        pmid=text('./MedlineCitation/PMID');title=text('.//ArticleTitle')
        if not pmid or not title: continue
        abstract='\n'.join(''.join(x.itertext()).strip() for x in a.findall('.//Abstract/AbstractText'))
        content=abstract or title
        date=a.find('.//ArticleDate')
        if date is None:date=a.find('.//JournalIssue/PubDate')
        published=None
        if date is not None:
            year=date.findtext('Year');month=date.findtext('Month');day=date.findtext('Day')
            if month in calendar.month_abbr:month=list(calendar.month_abbr).index(month)
            elif month in calendar.month_name:month=list(calendar.month_name).index(month)
            try:published=dt.datetime(int(year),int(month),int(day),tzinfo=dt.timezone.utc)
            except (ValueError,TypeError):pass
        doi=next((x.text for x in a.findall('.//ArticleId') if x.get('IdType')=='doi'),None)
        types=[''.join(x.itertext()) for x in a.findall('.//PublicationType')]
        out.append(academic_record('https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/',title,content,published,'PMID:'+pmid,
          {'raw_xml':ET.tostring(a,encoding='unicode'),'academic':{'pmid':pmid,'doi':doi,'journal':text('.//Journal/Title'),
           'publication_date_text':' '.join(date.itertext()) if date is not None else None,'publication_types':types,'status':'preprint' if 'Preprint' in types else 'indexed','version':None}}))
    return out


def collect(source):
    now=dt.datetime.now(dt.timezone.utc)
    previous=source['config'].get('cursor_date')
    start=dt.date.fromisoformat(previous)-dt.timedelta(days=3) if previous else now.date()-dt.timedelta(days=3)
    # Advance backlog a week at a time; never skip dates after downtime.
    end=min(now.date(),start+dt.timedelta(days=10))
    byte_count=0
    def get(url):
        nonlocal byte_count
        time.sleep(.36)  # PubMed no-key limit: < 3 requests/sec, one consumer per source lease.
        r=fetch(url);byte_count+=r.bytes_fetched
        if r.status!=200:
            error=RuntimeError('Academic API HTTP '+str(r.status)+' at '+url)
            error.http_status=r.status;error.bytes_fetched=byte_count
            raise error
        return r
    records=[]
    if source['adapter']=='pubmed':
        base='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/'
        query=source['config'].get('query',PUBMED_QUERY)
        args={'db':'pubmed','term':query,'datetype':'edat','mindate':str(start),'maxdate':str(end),'retmode':'json','retmax':1000,'sort':'pub_date','tool':'bioai_registry'}
        data=json.loads(get(base+'esearch.fcgi?'+urllib.parse.urlencode(args)).body)
        result=data.get('esearchresult')
        if not result or 'ERROR' in result:raise ValueError('Invalid PubMed search response')
        count=int(result['count'])
        if count>1000:raise ValueError('PubMed window exceeds 1000 records; narrow query/window before retry')
        ids=result.get('idlist',[])
        if len(ids)!=count:raise ValueError('Incomplete PubMed identifier list')
        for i in range(0,len(ids),25):
            batch_ids=ids[i:i+25]
            batch=parse_pubmed(get(base+'efetch.fcgi?'+urllib.parse.urlencode({'db':'pubmed','id':','.join(batch_ids),'retmode':'xml','tool':'bioai_registry'})).body)
            if {r['external_id'] for r in batch} != {'PMID:'+x for x in batch_ids}:
                raise ValueError('PubMed batch incomplete; cursor not advanced')
            records+=batch
    elif source['adapter']=='biorxiv':
        cursor=0
        for _ in range(100):
            r=get(f'https://api.biorxiv.org/details/biorxiv/{start}/{end}/{cursor}/json')
            data=json.loads(r.body);messages=data.get('messages') or []
            if not messages or messages[0].get('status') not in ('ok','no posts found'):raise ValueError('Invalid bioRxiv API response')
            batch=data.get('collection',[]);total=int(messages[0].get('total',0))
            for item in batch:
                if not any(k in (item.get('title','')+' '+item.get('abstract','')).lower() for k in TOPICS):continue
                doi=item['doi'];version=str(item.get('version','1'))
                records.append(academic_record('https://www.biorxiv.org/content/'+doi+'v'+version,item['title'],item.get('abstract',''),timestamp(item['date']),doi+':v'+version,
                  {'original':item,'academic':{'doi':doi,'version':version,'status':'preprint','journal_doi':item.get('published') if item.get('published') not in (None,'NA','') else None,'category':item.get('category')}}))
            cursor+=len(batch)
            if cursor>=total:break
            if not batch:raise ValueError('bioRxiv pagination stalled')
        else:raise ValueError('bioRxiv pagination limit reached; cursor not advanced')
    else:raise ValueError('Unsupported academic adapter')
    for row in records:
        row['raw_payload']['retrieval']={'adapter':source['adapter'],'from':str(start),'to':str(end),'query':source['config'].get('query'), 'lookback_days':3}
    return records,dict(http_status=200,bytes_fetched=byte_count),str(end)
