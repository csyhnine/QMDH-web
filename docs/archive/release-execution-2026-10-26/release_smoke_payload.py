from unittest.mock import patch
import socket
original=socket.socket.connect
def connect(self,address):
    if isinstance(address,tuple):
        import ipaddress
        ip=ipaddress.ip_address(address[0])
        if address[1] not in (5432,6379) or not ip.is_private:
            raise RuntimeError('Candidate external connection blocked')
    return original(self,address)
socket.socket.connect=connect
from alembic import command
from alembic.config import Config
command.upgrade(Config('alembic.ini'),'head')
from app.core.config import settings
from cryptography.fernet import Fernet
settings.encryption_key=Fernet.generate_key().decode()
settings.bootstrap_admin_name=''
from app import main
from fastapi.testclient import TestClient
with patch.object(main.BackgroundScheduler,'start'),patch.object(main.BackgroundScheduler,'shutdown'),patch('app.integrations.search.agent_memory_index.ensure_agent_memory_index'),patch.object(main,'seed_initial_data'):
    with TestClient(main.app) as client:
        assert client.get('/api/v1/health').status_code==200
        schema=client.get('/openapi.json').json()
        for prefix in ('/api/v1/tasks','/api/v1/chat','/api/v1/search','/api/v1/cad'):
            assert any(p.startswith(prefix) for p in schema['paths']),prefix
        print('APPLICATION_LIFESPAN_AND_ROUTER_WIRING_PASS')
from app.services.provider_adapters.comfyui import seed_maximum,_integer
g={'1':{'class_type':'easy seed'}}; m={'seed':[['1','seed']]}
assert seed_maximum(g,m)==2**50
assert _integer(2**50,'seed',0,seed_maximum(g,m))==2**50
try: _integer(2**50+1,'seed',0,seed_maximum(g,m))
except ValueError: pass
else: raise AssertionError('out of range accepted')
import inspect
from app.services.provider_adapters import comfyui
s=inspect.getsource(comfyui)
assert 'secrets.randbelow(seed_maximum(graph, mapping) + 1)' in s
assert '% (seed_maximum(graph, mapping) + 1)' in s
print('SEED_BOUNDARY_AND_RANDOM_BATCH_WIRING_PASS')
from sqlalchemy import inspect as si
from app.database import Base,engine
with engine.connect() as c:
    db=si(c)
    for name,t in Base.metadata.tables.items():
        assert set(t.columns.keys()) <= {x['name'] for x in db.get_columns(name)},name
print('MODEL_SCHEMA_COLUMNS_PASS')
