import re,urllib.parse
from bs4 import BeautifulSoup
SOCIAL={'linkedin.com':'LinkedIn','x.com':'X','twitter.com':'X','youtube.com':'YouTube','weixin.qq.com':'WeChat','mp.weixin.qq.com':'WeChat','weibo.com':'Weibo'}
PATTERNS=[('investor_relations',r'investor|investor-relations|投资者'),('newsroom',r'news|press|media.center|新闻|资讯'),('blog',r'blog|博客'),('publications',r'publication|论文')]

def discover(html,base):
    soup=BeautifulSoup(html,'html.parser');out={}
    def add(url,kind,label='',platform=None):
        url=urllib.parse.urljoin(base,url);p=urllib.parse.urlsplit(url)
        if p.scheme!='https' or not p.hostname or p.username or p.password:return
        url=urllib.parse.urlunsplit((p.scheme,p.netloc,p.path or '/',p.query,''))
        out[url]={'url':url,'source_type':kind,'name':label[:160] or kind,'platform':platform,'adapter':'rss' if kind=='rss' else 'sitemap' if kind=='sitemap' else 'unsupported' if kind=='social' else 'html','provenance':{'method':'official_backlink','discovered_on':base,'link_text':label[:200]}}
    for link in soup.find_all('link',href=True):
        if link.get('type') in ('application/rss+xml','application/atom+xml'):add(link['href'],'rss',link.get('title','RSS'))
    for a in soup.find_all('a',href=True):
        url=urllib.parse.urljoin(base,a['href']);p=urllib.parse.urlsplit(url);label=a.get_text(' ',strip=True);host=(p.hostname or '').lower().removeprefix('www.')
        social=next((v for k,v in SOCIAL.items() if host==k),None)
        if social:
            if p.path.strip('/') and not re.search(r'/share|/intent|/sharer|/status/',p.path):add(url,'social',label,social)
            continue
        # Hosted IR domains may differ from the homepage: save as unverified candidates.
        value=p.path+' '+host+' '+label
        if re.search(r'\brss\b|/feed/?$',value,re.I):add(url,'rss',label);continue
        if 'sitemap' in p.path.lower():add(url,'sitemap',label);continue
        for kind,pattern in PATTERNS:
            if re.search(pattern,value,re.I):add(url,kind,label);break
    return list(out.values())[:80]
