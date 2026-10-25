import pathlib,tarfile,json,hashlib,subprocess,shutil
B=pathlib.Path('/www/backup/qmdh-release-20261026')
root=pathlib.Path('/opt/qmdh-frp/workflows')
files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
with tarfile.open(B/'workflows-current.tar.gz','w:gz') as t: t.add(root,arcname='workflows')
with tarfile.open(B/'workflows-current.tar.gz') as t:
 for name,h in files.items(): assert hashlib.sha256(t.extractfile('workflows/'+name).read()).hexdigest()==h
(B/'workflows-sha256.json').write_text(json.dumps(files,indent=2))
cs=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-q'],text=True).split()],text=True))
summaries=[]
before=json.loads((B/'runtime-before.json').read_text())
for c in cs:
 role=(c['Config'].get('Labels') or {}).get('com.docker.compose.service')
 if role in ('backend','worker'):
  assert c['State']['Status']=='running' and c['RestartCount']==0
  code='import shutil\nassert all(shutil.which(x) for x in ["ffmpeg","Xvfb","ODAFileConverter"])\n'
  assert subprocess.run(['docker','exec',c['Id'],'python','-B','-c',code],capture_output=True).returncode==0
  original=next(v for v in before if (v['Config'].get('Labels') or {}).get('com.docker.compose.service')==role)
  assert sorted(c['Config']['Env'])==sorted(original['Config']['Env']),'runtime env changed'
  def mounts(v): return sorted([{k:m.get(k) for k in ['Type','Source','Destination','RW','Name','Propagation']} for m in v['Mounts']],key=lambda m:m['Destination'])
  assert mounts(c)==mounts(original),'runtime mounts changed'
  assert sorted(c['NetworkSettings']['Networks'])==sorted(original['NetworkSettings']['Networks']),'runtime networks changed'
  summaries.append({'service':role,'tools_present':True,'restart_count':0,'env_mounts_networks_match':True})
assert not subprocess.check_output(['docker','ps','-aq','--filter','name=qmdh-candidate-20261025-'],text=True).strip(),'temporary test container remains'
assert not subprocess.check_output(['docker','network','ls','-q','--filter','name=^qmdh-candidate-20261025$'],text=True).strip(),'temporary test network remains'
result={'checks':summaries,'workflow_files_backed_up':len(files),'temporary_test_resources_remaining':0,'active_release_directory':'/opt/qmdh-release-candidate-20261025','active_release_directory_must_be_preserved':True,'disk_free_GiB':shutil.disk_usage(B).free/2**30}
(B/'final-preservation.json').write_text(json.dumps(result,indent=2))
checksums={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in B.iterdir() if p.is_file() and p.name!='checksums.json'}
(B/'checksums.json').write_text(json.dumps(checksums,indent=2))
print(json.dumps(result))
