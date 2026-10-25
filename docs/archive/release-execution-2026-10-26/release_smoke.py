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
network='qmdh-candidate-20261025'; pg=network+'-pg'; app=network+'-app'
created=[]
try:
    run(['docker','network','create','--internal','--label',label,network]); created.append(('network',network))
    run(['docker','run','-d','--name',pg,'--label',label,'--network',network,'--network-alias','candidate-pg','--memory','192m','--memory-swap','192m','--cpus','.15','--tmpfs','/var/lib/postgresql/data:rw,size=268435456','-e','POSTGRES_PASSWORD=candidate-only','-e','POSTGRES_USER=candidate','-e','POSTGRES_DB=empty','sha256:890480b08124ce7f79960a9bb16fe39729aa302bd384bfd7c408fee6c8f7adb7']); created.append(('container',pg))
    for _ in range(30):
        if subprocess.run(['docker','exec',pg,'pg_isready','-U','candidate','-d','empty'],capture_output=True).returncode==0: break
        time.sleep(1)
    else: raise RuntimeError('temporary postgres unavailable')
    cache=network+'-redis'
    run(['docker','run','-d','--name',cache,'--label',label,'--network',network,'--network-alias','candidate-redis','--memory','32m','--memory-swap','32m','--cpus','.05','sha256:6ab0b6e7381779332f97b8ca76193e45b0756f38d4c0dcda72dbb3c32061ab99','redis-server','--save','','--appendonly','no','--maxmemory','16mb']); created.append(('container',cache))
    env={'QMDH_DATABASE_URL':'postgresql+psycopg://candidate:candidate-only@candidate-pg/empty','QMDH_ENV':'development','QMDH_TASK_EXECUTION_MODE':'redis','QMDH_MEDIA_ROOT':'/tmp/candidate-media','QMDH_REDIS_URL':'redis://candidate-redis:6379/0','QMDH_AUTH_USERS_JSON':'[]','QMDH_AGENT_CLIENTS_JSON':'[]','QMDH_IMAGE_PROVIDER_PROFILES_JSON':'[]','QMDH_SEARCH_ENABLED':'false'}
    imageenv=json.loads(subprocess.check_output(['docker','image','inspect','qmdh-candidate-backend:20261025'],text=True))[0]['Config']['Env']
    for v in imageenv:
        k=v.split('=',1)[0]
        if k.startswith('QMDH_'): env.setdefault(k,'')
    args=['docker','run','-d','--name',app,'--label',label,'--network',network,'--memory','512m','--memory-swap','512m','--cpus','.45','--pids-limit','128','--entrypoint','sleep']
    for k,v in env.items(): args+=['-e',k+'='+v]
    run(args+['qmdh-candidate-backend:20261025','600']); created.append(('container',app))
    def py(s): return run(['docker','exec','-i',app,'python','-B','-'],s)
    payload=(P/'smoke_payload.py').read_text()
    py(payload)

finally:
    for kind,name in reversed(created):
        if kind=='container': subprocess.run(['docker','rm','-f',name],check=True,capture_output=True)
        else: subprocess.run(['docker','network','rm',name],check=True,capture_output=True)
    print('OWNED_TEST_CONTAINERS_AND_NETWORK_REMOVED',flush=True)
