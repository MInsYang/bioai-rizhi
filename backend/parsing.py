import datetime as dt,hashlib,json,re,urllib.parse
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET
from .fetching import canonical

def timestamp(value):
    if not value:return None
    try:
        d=dt.datetime.fromisoformat(value.replace('Z','+00:00')) if re.match(r'^\d{4}-',value) else parsedate_to_datetime(value)
        return d.replace(tzinfo=dt.timezone.utc) if d.tzinfo is None else d
    except (ValueError,TypeError,OverflowError):return None

def record(url,title,content,date=None,external_id=None,payload=None):
    url=canonical(url);stable=json.dumps([url,title,content,str(date)],ensure_ascii=False)
    return dict(canonical_url=url,title=title[:1000],content_text=content[:250000],published_at=date,external_id=external_id,raw_payload=payload or {},content_hash=hashlib.sha256(stable.encode()).hexdigest())

def parse_feed(body,base):
    root=ET.fromstring(body);tag=root.tag.split('}')[-1]
    if tag not in ('rss','feed','RDF'):raise ValueError('Response is not RSS/Atom')
    out=[]
    for item in list(root.iter()):
        if item.tag.split('}')[-1] not in ('item','entry'):continue
        fields={c.tag.split('}')[-1]:c for c in item}
        def text(name):
            el=fields.get(name);return ''.join(el.itertext()).strip() if el is not None else ''
        title=text('title');link=fields.get('link');url=(link.get('href') or text('link')) if link is not None else ''
        if not title or not url:continue
        content=BeautifulSoup(text('encoded') or text('content') or text('description') or text('summary'),'html.parser').get_text(' ',strip=True)
        try:out.append(record(urllib.parse.urljoin(base,url),title,content,timestamp(text('pubDate') or text('published') or text('updated')),text('guid') or text('id'),{'raw_xml':ET.tostring(item,encoding='unicode'),'format':tag,'date_raw':text('pubDate') or text('published') or text('updated')}))
        except ValueError:continue
        if len(out)>=100:break
    return out

def parse_html(body,base):
    soup=BeautifulSoup(body,'html.parser');canonical_tag=soup.find('link',rel='canonical');url=urllib.parse.urljoin(base,canonical_tag.get('href',base)) if canonical_tag else base
    # Do not trust a cross-origin canonical claim as identity.
    if urllib.parse.urlsplit(url).hostname!=urllib.parse.urlsplit(base).hostname:url=base
    title_tag=soup.find('h1') or soup.find('title');title=title_tag.get_text(' ',strip=True) if title_tag else ''
    if not title:raise ValueError('Page has no title; manual adapter needed')
    date_tag=soup.find('meta',property='article:published_time');date=timestamp(date_tag.get('content')) if date_tag else None
    for tag in soup(['script','style','nav','header','footer']):tag.decompose()
    article=soup.find('article') or soup.find('main') or soup
    return [record(url,title,article.get_text(' ',strip=True),date,payload={'raw_html':body,'format':'html','review_required':True})]
