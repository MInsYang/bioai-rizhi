"""IndexNow receipt semantics and ownership are tested without contacting engines."""
import importlib.util
import json
from pathlib import Path

import httpx
import pytest

spec = importlib.util.spec_from_file_location('search_discovery', Path(__file__).resolve().parents[2] / 'scripts/submit_indexnow.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_change_detection_and_origin_boundaries():
    base = module.ORIGIN
    assert module.changed_urls({base: '', base + '/guides': '2026-10-08'}, {base: '', base + '/guides': '2026-10-07', base + '/briefings': ''}) == [base + '/briefings', base + '/guides']
    for url in ['https://evil.example/', base + '/api/admin/sources', base + '/?secret=test', base + '/#admin', base + '/companies/../admin']:
        with pytest.raises(ValueError):
            module.public_url(url)


@pytest.mark.parametrize('status', [200, 202, 403, 429])
def test_submission_only_checkpoints_confirmed_receipt(tmp_path, status):
    state = tmp_path / 'state.json'
    key = 'test-public-verification-key'
    calls = []
    def respond(request):
        if request.url.path == '/indexnow-key.txt':
            return httpx.Response(200, text=key)
        if request.url.path == '/sitemap.xml':
            return httpx.Response(200, text=f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{module.ORIGIN}/</loc></url></urlset>')
        if request.url.host == 'api.indexnow.org':
            calls.append(json.loads(request.content))
            return httpx.Response(status)
        raise AssertionError(request.url)
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        if status not in (200, 202):
            with pytest.raises(RuntimeError):
                module.submit(client, key, state)
        else:
            report = module.submit(client, key, state)
            assert not report['indexing_confirmed']
            assert report['submitted'] == 1
            assert key not in json.dumps(report)
            if status == 200:
                assert module.submit(client, key, state)['submitted'] == 0
    assert state.exists() == (status == 200)
    assert len(calls) == 1


def test_failed_verification_never_submits(tmp_path):
    def respond(request):
        assert request.url.path == '/indexnow-key.txt'
        return httpx.Response(200, text='different')
    with httpx.Client(transport=httpx.MockTransport(respond)) as client, pytest.raises(ValueError):
        module.submit(client, 'test-verification-key', tmp_path / 'state.json')


def test_collection_can_exceed_one_submission_batch(tmp_path, monkeypatch):
    current={module.ORIGIN+'/companies/company_'+str(i): '' for i in range(10001)}
    assert module.public_url(next(iter(current)))
    monkeypatch.setattr(module,'discover',lambda client: current)
    batches=[]
    def respond(request):
        if request.url.path=='/indexnow-key.txt':
            return httpx.Response(200,text='test-public-key')
        batches.append(len(json.loads(request.content)['urlList']))
        return httpx.Response(200)
    state=tmp_path/'state.json'
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        report=module.submit(client,'test-public-key',state)
        assert report['submitted']==10001 and batches==[10000,1]
        current[module.ORIGIN+'/companies/new_company']=''
        assert module.submit(client,'test-public-key',state)['submitted']==1
    assert batches==[10000,1,1]
