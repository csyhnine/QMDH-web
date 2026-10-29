import subprocess,json,pathlib,hashlib,tarfile,io,urllib.request,urllib.error,shutil
B=pathlib.Path('/www/backup/qmdh-release-20261026'); P=pathlib.Path('/opt/qmdh-release-candidate-20261025')
manifest=json.loads((P/'RELEASE.json').read_text()); entries=json.loads((P/'manifest.json').read_text())['entries']
cs=json.loads(subprocess.check_output(['docker','inspect',*subprocess.check_output(['docker','ps','-q'],text=True).split()],text=True))
def service(role): return [c for c in cs if (c['Config'].get('Labels') or {}).get('com.docker.compose.project.working_dir')=='/www/wwwroot/qmdh-web' and c['Config']['Labels'].get('com.docker.compose.service')==role]
assert len(service('backend'))==1 and len(service('worker'))==3 and len(service('frontend'))==1
for role in ['backend','worker']:
 for c in service(role):
  code='import pathlib,hashlib,json\nentries='+repr(entries)+'\nassert all(hashlib.sha256(pathlib.Path(e["container_path"]).read_bytes()).hexdigest()==e["candidate_sha256"] for e in entries)\nprint("76_OVERLAY_FILES_MATCH")'
  p=subprocess.run(['docker','exec',c['Id'],'python','-B','-c',code],capture_output=True,text=True)
  assert p.returncode==0,role+' live source mismatch'
for r in ['backend','worker','frontend']: assert all(c['Image']==manifest['images'][r] for c in service(r))
b=service('backend')[0]
code='from app.database import engine\nfrom sqlalchemy import text\nwith engine.connect() as c:\n c.execute(text("SET TRANSACTION READ ONLY"))\n assert c.execute(text("select version_num from alembic_version")).scalar()=="e51fa962c846"\n c.rollback()\n'
assert subprocess.run(['docker','exec',b['Id'],'python','-B','-c',code],capture_output=True).returncode==0
f=service('frontend')[0]
data=subprocess.check_output(['docker','exec',f['Id'],'tar','-C','/usr/share/nginx/html','-cf','-','.'])
with tarfile.open(fileobj=io.BytesIO(data)) as t:
 for p in (P/'html').rglob('*'):
  if p.is_file(): assert t.extractfile('./'+str(p.relative_to(P/'html'))).read()==p.read_bytes(),'frontend file mismatch'
checks=[]
for route,expected in [('/',200),('/studio/generate',200),('/api/v1/health',200),('/api/v1/tasks',200),('/api/v1/cad/extracts',401),('/api/v1/cad/extracts/',401),('/api/v1/cad/extracts?limit=1',401),('/api/v1/cad/extracts?limit=20',401),('/api/v1/cad/extracts/?limit=20',401),('/api/v1/cad/extracts/proxy-check',401)]:
 try:
  with urllib.request.urlopen('https://cityusbdisk.cn'+route,timeout=15) as r: status=r.status; body=r.read()
 except urllib.error.HTTPError as e: status=e.code; body=e.read()
 assert status==expected,'public route status mismatch '+route+': '+str(status)
 if route=='/': assert body==(P/'html/index.html').read_bytes(),'public index mismatch'
 if route=='/api/v1/tasks': assert json.loads(body)==[],'anonymous tasks contract mismatch'
 checks.append({'route':route,'status':status})
import re
index=(P/'html/index.html').read_text()
asset=re.search(r'src="(/assets/[^"]+\.js)"',index).group(1)
with urllib.request.urlopen('https://cityusbdisk.cn'+asset,timeout=15) as r: assert r.read()==(P/'html'/asset.lstrip('/')).read_bytes()
assert hashlib.sha256(pathlib.Path('/www/wwwroot/qmdh-web/.env').read_bytes()).hexdigest()==hashlib.sha256((B/'production.env').read_bytes()).hexdigest()
manifest.update({'status':'DEPLOYED_VERIFIED','database_revision':'e51fa962c846','public_checks':checks,'overlay_files_checked_per_backend_worker':76,'frontend_files_checked':sum(p.is_file() for p in (P/'html').rglob('*')),'public_bundle_sha256':hashlib.sha256((P/'html'/asset.lstrip('/')).read_bytes()).hexdigest(),'env_unchanged':True,'rollback_executed':False})
(B/'RELEASE.json').write_text(json.dumps(manifest,indent=2)); (P/'RELEASE.json').write_text(json.dumps(manifest,indent=2))
checksums={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in B.iterdir() if p.is_file() and p.name!='checksums.json'}
(B/'checksums.json').write_text(json.dumps(checksums,indent=2))
print(json.dumps(manifest))
