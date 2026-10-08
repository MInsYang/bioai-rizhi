"""Bounded public HTTPS transport. Pin resolved IPs and revalidate every redirect."""
import ipaddress,socket,subprocess,tempfile,urllib.parse,time
from pathlib import Path
from dataclasses import dataclass
from urllib.robotparser import RobotFileParser
USER_AGENT='BioAIRegistry/1.0 (+source-verification; public-news-metadata)'
MAX_BYTES=2_000_000
@dataclass
class Response:
    url:str
    status:int
    headers:dict
    body:str
    bytes_fetched:int
    duration_ms:int

def public_url(url):
    p=urllib.parse.urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443):raise ValueError('Only public HTTPS URLs without credentials are allowed')
    try:addresses={a[4][0] for a in socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)}
    except socket.gaierror as e:raise ValueError('Hostname cannot be resolved') from e
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):raise ValueError('Non-public address blocked')
    return p,sorted(addresses,key=lambda ip:':' in ip)[0]

def fetch(url,headers=None):
    started=time.monotonic()
    for _ in range(5):
        p,ip=public_url(url)
        with tempfile.TemporaryDirectory() as temp:
            hp=Path(temp)/'headers';bp=Path(temp)/'body'
            args=['curl','--silent','--show-error','--noproxy','*','--proto','=https','--max-time','20','--connect-timeout','8','--max-filesize',str(MAX_BYTES),'--resolve',f'{p.hostname}:443:{"["+ip+"]" if ":" in ip else ip}','--user-agent',USER_AGENT,'--dump-header',str(hp),'--output',str(bp),'--write-out','%{http_code}']
            for k,v in (headers or {}).items():
                if k.lower() in ('if-none-match','if-modified-since') and '\n' not in v and '\r' not in v:args.extend(['--header',k+': '+v])
            result=subprocess.run([*args,url],capture_output=True,text=True)
            if result.returncode:raise RuntimeError('HTTPS fetch failed: '+result.stderr[:400])
            status=int(result.stdout);raw=hp.read_text(errors='replace');block=raw.strip().split('\n\n')[-1]
            hs={k.strip().lower():v.strip() for line in block.splitlines()[1:] if ':' in line for k,v in [line.split(':',1)]}
            if status in (301,302,303,307,308):url=urllib.parse.urljoin(url,hs.get('location',''));headers={};continue
            b=bp.read_bytes()
            if len(b)>MAX_BYTES:raise ValueError('Response too large')
            return Response(url,status,hs,b.decode('utf-8-sig',errors='replace'),len(b),int((time.monotonic()-started)*1000))
    raise RuntimeError('Too many redirects')

def check_robots(url):
    p=urllib.parse.urlsplit(url);response=fetch(f'https://{p.netloc}/robots.txt')
    if response.status==404:return
    if response.status!=200:raise RuntimeError('robots.txt unavailable: '+str(response.status))
    robots=RobotFileParser();robots.parse(response.body.splitlines())
    if not robots.can_fetch(USER_AGENT,url):raise RuntimeError('robots.txt disallows this URL')

def canonical(url):
    p=urllib.parse.urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password:raise ValueError('Invalid source link')
    q=[(k,v) for k,v in urllib.parse.parse_qsl(p.query) if not k.lower().startswith('utm_') and k.lower() not in ('fbclid','gclid')]
    return urllib.parse.urlunsplit((p.scheme,p.netloc.lower(),p.path or '/',urllib.parse.urlencode(sorted(q)),''))
