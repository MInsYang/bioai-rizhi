#!/usr/bin/env python3
"""Exercise the deployed analytics chain using explicitly excluded QA traffic."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import time
import uuid

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]


def rpc(client, base, method, params, identifier):
    response = client.post(base + '/mcp', headers={'Accept':'application/json, text/event-stream',
                            'MCP-Protocol-Version':'2025-11-25', 'X-BioAI-Analytics-Test':'1'},
                           json={'jsonrpc':'2.0','id':identifier,'method':method,'params':params})
    assert response.status_code == 200, ('MCP HTTP', response.status_code)
    if 'text/event-stream' in response.headers.get('content-type', ''):
        values = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ')]
        return next(item for item in values if item.get('id') == identifier)
    return response.json()


def run(local=False):
    if local:
        config = dict(line.split('=',1) for line in (ROOT/'.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
        base = 'http://127.0.0.1:8789'
        token = os.environ.get('BIOAI_PREVIEW_ADMIN_TOKEN', 'local-only-analytics-browser-preview-20261008')
    else:
        config = json.loads((ROOT/'.sites-runtime/cloud-secrets.json').read_text())
        base = 'https://bioai-rizhi.pages.dev'
        token = config['ADMIN_TOKEN']
    auth = {'Authorization':'Bearer '+token}
    started = dt.datetime.now(dt.timezone.utc)
    with httpx.Client(proxy=None if local else os.environ.get('HTTPS_PROXY'), trust_env=False,
                      timeout=45, headers={'User-Agent':'BioAI-Analytics-Acceptance/1.0'}) as client, psycopg.connect(config['DATABASE_URL']) as db:
        assert client.get(base+'/api/admin/analytics').status_code == 401
        assert client.get(base+'/api/admin/analytics',headers={'Authorization':'Bearer invalid'}).status_code == 401
        baseline = client.get(base+'/api/admin/analytics?days=7',headers=auth)
        baseline.raise_for_status()
        assert baseline.headers['cache-control'] == 'no-store'
        rows = baseline.json()
        assert rows['timezone'] == 'Asia/Shanghai' and len(rows['daily']) == 7
        company = client.get(base+'/api/companies?limit=1').json()['items'][0]
        record = client.get(base+'/api/records?limit=1').json()['items'][0]
        headers = {'Origin':base,'User-Agent':'Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
                   'X-BioAI-Analytics-Test':'1'}
        sid = str(uuid.uuid4())
        events = []
        for kind, target in [('page_view',None),('outbound_click','nature.com'),('company_open',company['slug']),
                             ('resource_open',record['id']),('mcp_copy','mcp'),('rss_click','rss')]:
            payload = {'event_id':str(uuid.uuid4()),'session_id':sid,'event_type':kind,
                       'path':'/topics/virtual-cell','traffic_type':'test'}
            if target:
                payload['target'] = target
            response = client.post(base+'/api/telemetry',headers=headers,json=payload)
            assert response.status_code == 202, (kind,response.status_code)
            events.append(payload)
        assert client.post(base+'/api/telemetry',headers=headers,json=events[0]).status_code == 202
        assert client.post(base+'/api/telemetry',headers={**headers,'Origin':'https://unrelated.example'},json=events[0]).status_code == 403
        assert client.post(base+'/api/telemetry',headers=headers,json={**events[0],'path':'/#admin'}).status_code == 422
        assert client.post(base+'/api/telemetry',headers={**headers,'DNT':'1'},json=events[0]).status_code == 204
        ids = [event['event_id'] for event in events]
        count, all_test, digests = db.execute('SELECT count(*),bool_and(is_test),count(DISTINCT session_hash) FROM usage_web_events WHERE event_id=ANY(%s::uuid[])',(ids,)).fetchone()
        assert (count,all_test,digests) == (6,True,1)
        assert db.execute('SELECT bool_and(session_hash<>%s AND length(session_hash)=64) FROM usage_web_events WHERE event_id=ANY(%s::uuid[])',(sid,ids)).fetchone()[0]
        mcp_before = {str(row[0]) for row in db.execute('SELECT execution_id FROM usage_mcp_calls WHERE is_test AND started_at>=%s',(started,))}
        init = rpc(client,base,'initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'analytics-acceptance','version':'1'}},1)
        assert 'result' in init
        assert len(rpc(client,base,'tools/list',{},2)['result']['tools']) == 5
        assert not rpc(client,base,'tools/call',{'name':'get_source_status','arguments':{'limit':1}},3)['result'].get('isError',False)
        assert not rpc(client,base,'tools/call',{'name':'search_resources','arguments':{'query':'organoid','limit':1}},4)['result'].get('isError',False)
        assert rpc(client,base,'tools/call',{'name':'get_resource','arguments':{'id':str(uuid.uuid4()),'kind':'record'}},5)['result']['isError']
        # Wait only for this QA batch's async waitUntil writes; do not publish totals.
        for attempt in range(15):
            db.commit()
            calls = [row for row in db.execute('SELECT execution_id,tool_name,success,duration_ms FROM usage_mcp_calls WHERE is_test AND started_at>=%s',(started,)) if str(row[0]) not in mcp_before]
            if len(calls) >= 3:
                break
            time.sleep(0.5)
        assert len(calls) == 3, ('QA executions',len(calls))
        assert sum(row[2] for row in calls) == 2
        assert all(row[3]>=0 for row in calls)
        for days in (1,7,30):
            response = client.get(base+'/api/admin/analytics?days='+str(days),headers=auth)
            response.raise_for_status()
            data = response.json()
            assert len(data['daily']) == days and data['retention_days'] == 90
        return {'status':'passed','origin':base,'tested_at':dt.datetime.now(dt.timezone.utc).isoformat(),
                'web_test_events':6,'duplicate_deduped':True,'test_mcp_executions':3,'test_mcp_successes':2,'test_mcp_errors':1,
                'handshake_and_tools_list_excluded':True,'admin_auth_and_no_store':True,'days_checked':[1,7,30],
                'same_origin_and_admin_path_protection':True,'dnt_omitted':True,'session_hmac_verified':True,
                'all_acceptance_traffic_flagged_test':True,'historical_visitors_inferred':False,
                'live_user_statistics_exported':False}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--local',action='store_true')
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    try:
        report=run(args.local)
    except Exception as error:
        print(json.dumps({'status':'failed','error_type':type(error).__name__}))
        raise SystemExit(1)
    target=args.report or ROOT/('.sites-runtime/analytics-local-acceptance.json' if args.local else 'docs/analytics-acceptance.json')
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':
    main()
