"""R59 pure metadata and request constructors; no application or video execution imports."""
import ast
import copy
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]

def load(relative,names=None,namespace=None,assignments=()):
    ns={} if namespace is None else namespace
    tree=ast.parse((ROOT/relative).read_bytes())
    selected=[]
    for node in tree.body:
        if isinstance(node,ast.FunctionDef) and (names is None or node.name in names):selected.append(node)
        elif isinstance(node,(ast.Assign,ast.AnnAssign)):
            targets=node.targets if isinstance(node,ast.Assign) else [node.target]
            if any(isinstance(t,ast.Name) and t.id in assignments for t in targets):selected.append(node)
    future=ast.ImportFrom(module='__future__',names=[ast.alias(name='annotations')],level=0)
    exec(compile(ast.fix_missing_locations(ast.Module(body=[future,*selected],type_ignores=[])),relative,'exec'),ns)
    return ns

def metadata():
    file=ROOT/'app/services/task_reference_metadata.py'
    return load('app/services/task_reference_metadata.py') if file.exists() else {}

def router():
    ns=metadata();ns.update(TaskOut=lambda **kw:SimpleNamespace(**kw),TaskStatus=SimpleNamespace(pending='pending',running='running'),resolve_storage_payload=copy.deepcopy)
    return load('app/routers/tasks.py',{'_reference_image_count','_reference_image_storage_paths','_to_task_out'},ns)

def executor():return load('app/services/task_executor.py',{'_extract_reference_images','_reference_image_result_fields'},metadata())

def task(payload,result):
    return SimpleNamespace(id=9,title='history',status='completed',workflow=SimpleNamespace(key='video-generate',name='video'),project=SimpleNamespace(code='P'),user=SimpleNamespace(name='test'),requested_provider='happyhorse',classification='B',cost=1,cost_currency='CNY',latency_ms=0,payload=payload,result=result,created_at=None,updated_at=None)

def project(record):
    with patch('sqlalchemy.orm.object_session',return_value=None):return router()['_to_task_out'](record).result

def adapter():
    ns={'resolve_public_media_url':lambda p:p}
    return load('app/services/provider_adapters/haodeya_grok_video.py',{'_collect_reference_paths','_reject_seedance_asset_protocol','_build_happyhorse_request_body','_build_grok_request_body','_grok_frame_image_item','_grok_image_item'},ns,{'GROK_VIDEO_SKUS','HAPPYHORSE_VIDEO_SKUS','SEEDANCE2_VIDEO_SKUS','HAODEYA_VIDEO_SKUS'})

class ReferenceHistoryTests(unittest.TestCase):
    def test_accepted_metadata_retains_nine_paths_in_order(self):
        paths=[f'A{i}' for i in range(9)];ns=router();payload={'reference_images':paths}
        self.assertEqual(ns['_reference_image_count'](payload),9)
        self.assertEqual(ns['_reference_image_storage_paths'](payload),paths)
        self.assertEqual(payload,{'reference_images':paths})

    def test_completed_metadata_retains_nine_without_changing_execution_extract_limit(self):
        paths=[f'A{i}' for i in range(9)];ns=executor();payload={'reference_images':paths};fields=ns['_reference_image_result_fields'](payload)
        self.assertEqual(fields['reference_image_count'],9);self.assertEqual(fields['reference_image_storage_paths'],paths)
        self.assertEqual(ns['_extract_reference_images'](payload),paths[:4])

    def test_read_projection_restores_truncated_history_without_mutation(self):
        paths=[f'A{i}' for i in range(9)];record=task({'reference_images':paths,'video_sku':'happyhorse-1.1-r2v-5s'},{'reference_image_storage_paths':paths[:4],'reference_image_count':4,'summary':'completed'})
        before=copy.deepcopy(vars(record));out=project(record)
        self.assertEqual(out['reference_image_storage_paths'],paths);self.assertEqual(out['reference_image_count'],9)
        self.assertEqual(out['reference_image_history_source'],'task_payload');self.assertFalse(out['reference_image_history_incomplete'])
        self.assertEqual(out['video_sku'],'happyhorse-1.1-r2v-5s')
        self.assertEqual(vars(record),before);self.assertEqual(out['summary'],'completed')

    def test_missing_payload_marks_known_incomplete_record_without_inventing_paths(self):
        record=task({}, {'reference_image_storage_paths':['A1','A2','A3','A4'],'reference_image_count':9,'reference_image_supplied':True})
        out=project(record);self.assertEqual(out['reference_image_storage_paths'],['A1','A2','A3','A4']);self.assertEqual(out['reference_image_count'],9)
        self.assertEqual(out['reference_image_history_source'],'recorded_result');self.assertTrue(out['reference_image_history_incomplete'])
        unknown=project(task({},{}));self.assertEqual(unknown['reference_image_history_source'],'unavailable');self.assertFalse(unknown['reference_image_history_incomplete'])

    def test_empty_saved_payload_and_legacy_single_reference_are_projected(self):
        empty=project(task({'reference_images':[]},{'reference_image_count':4,'reference_image_storage_paths':['old']}))
        self.assertEqual(empty['reference_image_count'],0);self.assertEqual(empty['reference_image_storage_paths'],[]);self.assertFalse(empty['reference_image_history_incomplete'])
        one=project(task({}, {'reference_image_storage_path':'old-single','reference_image_count':1}));self.assertEqual(one['reference_image_storage_paths'],['old-single']);self.assertFalse(one['reference_image_history_incomplete'])

    def test_happyhorse_constructor_preserves_nine_and_rejects_ten(self):
        build=adapter()['_build_happyhorse_request_body']
        for n in [1,4,5,9]:
            with self.subTest(count=n):
                refs=[f'https://fixture.invalid/A{i}' for i in range(n)];body=build('happyhorse-1.1-r2v-5s','prompt',{'reference_images':refs})
                self.assertEqual(body['metadata']['input']['media'],[{'type':'reference_image','url':ref} for ref in refs])
        with self.assertRaisesRegex(ValueError,'at most 9'):build('happyhorse-1.1-r2v-5s','prompt',{'reference_images':[f'A{i}' for i in range(10)]})
        self.assertNotIn('media',build('happyhorse-1.1-t2v-5s','prompt',{})['metadata']['input'])
        with self.assertRaisesRegex(ValueError,'must not'):build('happyhorse-1.1-t2v-5s','prompt',{'reference_images':['A']})
        self.assertEqual(build('happyhorse-1.1-i2v-5s','prompt',{'reference_images':['A']})['metadata']['input']['media'],[{'type':'first_frame','url':'A'}])
        with self.assertRaisesRegex(ValueError,'exactly one'):build('happyhorse-1.1-i2v-5s','prompt',{'reference_images':['A','B']})

    def test_grok_constructor_keeps_original_four_reference_limit(self):
        ns=adapter();build=ns['_build_grok_request_body'];refs=[f'A{i}' for i in range(4)]
        self.assertEqual(len(build('x-ai/grok-imagine-video-ref','prompt',{'reference_images':refs})['input_references']),4)
        with self.assertRaisesRegex(ValueError,'at most 4'):build('x-ai/grok-imagine-video-ref','prompt',{'reference_images':refs+['A4']})

    def test_projection_normalizes_aliases_and_preserves_unrelated_result_fields(self):
        refs=[' A ',None,'','B','A'];record=task({'source_images':refs,'private_field':'must not be returned','video_sku':'payload-sku'}, {'usage':{'tokens':12},'generation_progress':{'kind':'original'},'video_sku':'actual-execution-sku'})
        before=copy.deepcopy(vars(record));out=project(record)
        self.assertEqual(out['reference_image_storage_paths'],['A','B','A']);self.assertEqual(out['reference_image_count'],3)
        self.assertEqual(out['usage'],{'tokens':12});self.assertEqual(out['generation_progress'],{'kind':'original'});self.assertNotIn('private_field',out);self.assertEqual(vars(record),before)
        self.assertEqual(out['video_sku'],'actual-execution-sku')
