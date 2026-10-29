import subprocess,json,pathlib,shutil,hashlib,tarfile,time
P=pathlib.Path('/opt/qmdh-release-candidate-20261025'); label='qmdh.release.candidate=20261025'
def capacity(start=False):
    m={l.split(':')[0]:int(l.split()[1]) for l in pathlib.Path('/proc/meminfo').read_text().splitlines()}
    assert m['MemAvailable']>=(1280 if start else 600)*1024,'memory threshold'
    assert shutil.disk_usage('/var/lib/docker').free>=8*2**30,'disk threshold'
def run(a,source=None,timeout=180):
    p=subprocess.Popen(a,stdin=subprocess.PIPE if source else subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    if source: p.stdin.write(source); p.stdin.close()
    # Logs are small for these bounded operations. Poll capacity while running.
    begin=time.monotonic()
    while p.poll() is None:
        try: capacity()
        except Exception:
            p.kill(); raise
        if time.monotonic()-begin>timeout: p.kill(); raise RuntimeError('operation timeout')
        time.sleep(1)
    out=p.stdout.read(); print(out[-10000:],flush=True)
    assert p.returncode==0,'command failed: '+str(a[:4])
    return out
capacity(True)
assert hashlib.sha256((P/'backend-overlay.tar.gz').read_bytes()).hexdigest()=='f5fdfa1c61eaf87f8be80bbb54bf6f461158b3aeb7daadda70a1cfcfbbd75392'
manifest=json.loads((P/'manifest.json').read_text())
with tarfile.open(P/'backend-overlay.tar.gz') as t:
    assert all(not x.name.startswith('/') and '..' not in pathlib.PurePosixPath(x.name).parts and x.isfile() for x in t.getmembers())
    t.extractall(P/'overlay')
for e in manifest['entries']:
    assert hashlib.sha256((P/'overlay'/e['container_path'].removeprefix('/app/')).read_bytes()).hexdigest()==e['candidate_sha256']
for role,base in manifest['base_image_ids'].items():
    run(['docker','tag',base,'qmdh-candidate-base-'+role+':20261025'])
    (P/'Dockerfile').write_text('FROM qmdh-candidate-base-'+role+':20261025\nCOPY overlay/ /app/\n')
    run(['docker','build','--network=none','--pull=false','--label',label,'-t','qmdh-candidate-'+role+':20261025',str(P)])
    print(role+' image '+subprocess.check_output(['docker','image','inspect','--format','{{.Id}}','qmdh-candidate-'+role+':20261025'],text=True),flush=True)
network='qmdh-candidate-20261025'; pg=network+'-pg'; app=network+'-app'
created=[]
try:
    run(['docker','network','create','--internal','--label',label,network]); created.append(('network',network))
    run(['docker','run','-d','--name',pg,'--label',label,'--network',network,'--network-alias','candidate-pg','--memory','192m','--memory-swap','192m','--cpus','.15','--tmpfs','/var/lib/postgresql/data:rw,size=268435456','-e','POSTGRES_PASSWORD=candidate-only','-e','POSTGRES_USER=candidate','-e','POSTGRES_DB=empty','sha256:890480b08124ce7f79960a9bb16fe39729aa302bd384bfd7c408fee6c8f7adb7']); created.append(('container',pg))
    for _ in range(30):
        if subprocess.run(['docker','exec',pg,'pg_isready','-U','candidate','-d','empty'],capture_output=True).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('temporary postgres unavailable')
    env={'QMDH_DATABASE_URL':'postgresql+psycopg://candidate:candidate-only@candidate-pg/empty','QMDH_ENV':'development','QMDH_TASK_EXECUTION_MODE':'redis','QMDH_MEDIA_ROOT':'/tmp/candidate-media','QMDH_REDIS_URL':'redis://127.0.0.1:1/0','QMDH_AUTH_USERS_JSON':'[]','QMDH_AGENT_CLIENTS_JSON':'[]','QMDH_IMAGE_PROVIDER_PROFILES_JSON':'[]','QMDH_SEARCH_ENABLED':'false'}
    imageenv=json.loads(subprocess.check_output(['docker','image','inspect','qmdh-candidate-backend:20261025'],text=True))[0]['Config']['Env']
    for v in imageenv:
        k=v.split('=',1)[0]
        if k.startswith('QMDH_'): env.setdefault(k,'')
    args=['docker','run','-d','--name',app,'--label',label,'--network',network,'--memory','512m','--memory-swap','512m','--cpus','.5','--pids-limit','128','--entrypoint','sleep']
    for k,v in env.items(): args+=['-e',k+'='+v]
    run(args+['qmdh-candidate-backend:20261025','600']); created.append(('container',app))
    def py(s): return run(['docker','exec','-i',app,'python','-B','-'],s)
    py("from alembic import command\nfrom alembic.config import Config\ncommand.upgrade(Config('alembic.ini'),'head')\nfrom app.database import engine\nfrom sqlalchemy import text\nwith engine.connect() as c: assert c.execute(text('select version_num from alembic_version')).scalar()=='e51fa962c846'\nprint('EMPTY_POSTGRES_UPGRADE_PASS')\n")
    run(['docker','exec',pg,'createdb','-U','candidate','old_b27'])
    py("from app.core.config import settings\nsettings.database_url='postgresql+psycopg://candidate:candidate-only@candidate-pg/old_b27'\nfrom alembic import command\nfrom alembic.config import Config\nc=Config('alembic.ini')\ncommand.upgrade(c,'b27d0f85c932')\ncommand.upgrade(c,'head')\nfrom sqlalchemy import create_engine,text\nwith create_engine(settings.database_url).connect() as db: assert db.execute(text('select version_num from alembic_version')).scalar()=='e51fa962c846'\nprint('CONSTRUCTED_B27_POSTGRES_UPGRADE_PASS')\n")
    print('MIGRATION_GATES_PASS',flush=True)
finally:
    for kind,name in reversed(created):
        if kind=='container': subprocess.run(['docker','rm','-f',name],check=True,capture_output=True)
        else: subprocess.run(['docker','network','rm',name],check=True,capture_output=True)
    print('OWNED_TEST_CONTAINERS_AND_NETWORK_REMOVED',flush=True)
