#!/usr/bin/env python3
"""Publish a fixed, evidence-reviewed batch through normal authenticated APIs.

No automatic event approval: this dated manifest records the root agent's explicit
source review. Further harvested candidates remain pending. Credentials use env.
"""
import argparse,json,os,uuid
from pathlib import Path
import httpx
ROOT=Path(__file__).resolve().parents[1]
NS=uuid.UUID('d801c6e4-f665-4927-9c57-e8f1974978cb')
def main():
 p=argparse.ArgumentParser();p.add_argument('--origin',required=True);p.add_argument('--apply',action='store_true');a=p.parse_args()
 reviewed=json.loads((ROOT/'docs/editorial-reviewed-2026-10-08.json').read_text())
 source=json.loads((ROOT/'docs/bootstrap/bioai_industry_sources_v2.json').read_text())
 items={x['candidate_key']:x for x in source['event_candidates']}
 if not a.apply:
  print(json.dumps({'status':'dry_run','count':len(reviewed['items']),'review_method':reviewed['review_method']},ensure_ascii=False));return
 if a.origin not in ['http://127.0.0.1:8789','https://bioai-rizhi.pages.dev']:raise ValueError('Unexpected publication destination')
 with httpx.Client(trust_env=False,proxy=os.environ.get('HTTPS_PROXY') if a.origin.startswith('https:') else None,base_url=a.origin,headers={'Authorization':'Bearer '+os.environ['ADMIN_TOKEN']},timeout=60) as client:
  response=client.get('/api/admin/candidates');response.raise_for_status();candidates={x['canonical_url']:x for x in response.json()}
  result=[]
  for review in reviewed['items']:
   source=items[review['key']];candidate=candidates.get(source['canonical_url'])
   if not candidate:
    result.append({'key':review['key'],'status':'not_pending'});continue
   company_ids={}
   for slug in review['company_slugs']:
    r=client.get('/api/companies/'+slug);r.raise_for_status();company_ids[slug]=r.json()['id']
   # Using the retained complete short excerpt preserves named parties in titles.
   quote=source['evidence']['retained_content_text']
   assert quote==candidate['content_text'], 'Candidate revision changed; review it again'
   relations=[]
   for subject,predicate,obj in review.get('relations',[]):
    relations.append({'subject_id':company_ids[subject],'object_id':company_ids[obj],'predicate':predicate,'evidence_text':quote})
   body={'request_id':str(uuid.uuid5(NS,review['key'])),'raw_item_id':candidate['id'],'title':source['title'],'summary':review['summary'],
    'evidence_text':quote,'track':'生物医药','event_type':{'financing':'funding','clinical_trial_milestone':'clinical','merger_acquisition':'acquisition','product_launch':'product','model_or_dataset_release':'model','facility_or_geographic_expansion':'strategy'}.get(source['event_type'],source['event_type']),'company_ids':list(company_ids.values()),'relations':relations,
    'occurred_at':None,'review_method':reviewed['review_method']}
   r=client.post('/api/admin/events',json=body)
   if r.is_error:raise ValueError(str(r.status_code)+' '+r.text[:500])
   event=r.json()
   r=client.post('/api/admin/candidates/'+candidate['candidate_id']+'/complete',json={'event_id':event['id']});r.raise_for_status()
   result.append({'key':review['key'],'event_id':event['id'],'status':event['status'],'relations':len(relations)})
  print(json.dumps({'origin':a.origin,'items':result},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
