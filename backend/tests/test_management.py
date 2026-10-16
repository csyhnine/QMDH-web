from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from alembic.migration import MigrationContext
from alembic.operations import Operations
from app.core.security import hash_session_token
from app.database import Base, get_db
from app.models import AuthSession, ManagementProject, ManagementRevision, User
from app.routers import management, auth


@pytest.fixture
def env():
    engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        for id, role, manager, unit in [(1,"admin",False,"二分院"),(2,"ops",False,"二分院"),(3,"designer",True,"二分院"),(4,"designer",True,"外院"),(5,"ops",True,"二分院")]:
            db.add(User(id=id, name=f"u{id}", role=role, company_management=manager, company_unit=unit, company_position="院长"))
            db.flush()
            db.add(AuthSession(user_id=id, token_hash=hash_session_token(f"token{id}"), expires_at=datetime.now(timezone.utc)+timedelta(days=1)))
        db.commit()
    def database():
        with sessions() as db: yield db
    app = FastAPI(); app.include_router(management.router); app.include_router(auth.router)
    app.dependency_overrides[get_db] = database
    with TestClient(app) as client: yield client, sessions
    engine.dispose()


def headers(id=3): return {"Authorization": f"Bearer token{id}"}
def new_staff(http, name="员工", id=3):
    response = http.post("/management/staff", headers=headers(id), json={"name":name})
    assert response.status_code == 201, response.text
    return response.json()

def project(http, **fields):
    response = http.post("/management/projects?year=2026", headers=headers(), json={"name":"项目", **fields})
    assert response.status_code == 201, response.text
    return response.json()

def payload(saved): return {k:v for k,v in saved.items() if k not in {"id","unit","year","updated_by","updated_at"}}


def test_permissions_are_independent_of_site_role_and_revocation_is_immediate(env):
    http, sessions = env
    for path in ["/management/projects?year=2026", "/management/reports/2026", "/management/staff", "/management/projects/1/revisions"]:
        assert http.get(path).status_code == 401
        for id in (1,2): assert http.get(path, headers=headers(id)).status_code == 403
    for id in (3,5):
        response = http.get("/management/projects?year=2026", headers=headers(id))
        assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
        assert http.get("/auth/me", headers=headers(id)).json()["company_management"] is True
    with sessions() as db:
        db.get(User,3).company_management = False; db.commit()
    assert http.get("/management/staff", headers=headers()).status_code == 403


def test_project_money_staff_stages_persist_without_studio_records_and_archive_restores(env):
    http, sessions = env
    person = new_staff(http)
    p = project(http, investment="1234567890.12", design_fee="0", paid=None,
        team={"coordinator":[person["id"]]}, next_week_staff=[person["id"]], next_week_work="外业",
        stages=[{"id":"stage1","name":"方案","start":"2026-10-16","end":"2026-10-22","assignees":[person["id"]],"allocation":50}])
    assert p["investment"] == "1234567890.12" and p["design_fee"] == "0" and p["paid"] is None
    assert http.get("/management/projects?year=2026", headers=headers()).json()[0] == p
    p2 = http.put(f"/management/projects/{p['id']}", headers=headers(), json={**payload(p),"archived":True,"stages":[]}).json()
    assert p2["version"] == 2
    assert http.get("/management/projects?year=2026", headers=headers()).json() == []
    assert len(http.get("/management/projects?year=2026&archived=true", headers=headers()).json()) == 1
    p3 = http.put(f"/management/projects/{p['id']}", headers=headers(), json={**payload(p2),"archived":False}).json()
    assert p3["version"] == 3
    revisions = http.get(f"/management/projects/{p['id']}/revisions", headers=headers()).json()
    assert len(revisions) == 3 and revisions[-1]["snapshot"]["stages"][0]["name"] == "方案"
    with sessions() as db:
        assert db.scalar(sa.text("select count(*) from projects")) == 0
        assert db.scalar(sa.select(sa.func.count()).select_from(ManagementRevision)) == 3


def test_units_are_isolated_for_read_write_and_staff_assignment(env):
    http, _ = env
    foreign = new_staff(http, id=4)
    p = project(http)
    assert http.get("/management/projects?year=2026",headers=headers(4)).json() == []
    assert http.get(f"/management/projects/{p['id']}/revisions",headers=headers(4)).status_code == 404
    assert http.put(f"/management/projects/{p['id']}",headers=headers(4),json=payload(p)).status_code == 404
    assert http.post("/management/projects?year=2026",headers=headers(),json={"name":"x","next_week_staff":[foreign["id"]]}).status_code == 422
    assert http.put(f"/management/staff/{foreign['id']}",headers=headers(),json={**foreign,"id":foreign['id']}).status_code == 422
    body = {k:v for k,v in foreign.items() if k != "id"}
    assert http.put(f"/management/staff/{foreign['id']}",headers=headers(),json=body).status_code == 409


def test_stale_project_edit_never_overwrites_other_user_or_adds_revision(env):
    http, sessions = env
    p = project(http)
    path = f"/management/projects/{p['id']}"
    first = http.put(path,headers=headers(),json={**payload(p),"name":"领导 A 的修改"})
    assert first.status_code == 200
    assert http.put(path,headers=headers(5),json={**payload(p),"name":"旧页面覆盖"}).status_code == 409
    assert http.get("/management/projects?year=2026",headers=headers()).json()[0]["name"] == "领导 A 的修改"
    with sessions() as db: assert db.scalar(sa.select(sa.func.count()).select_from(ManagementRevision)) == 2


@pytest.mark.parametrize("patch_body", [
    {"investment":"-1"},{"design_fee":"1.234"},{"name":"   "},{"urgency":"随便"},
    {"stages":[{"name":"bad","start":"2026-10-20","end":"2026-10-19"}]},
    {"stages":[{"name":"bad","start":"2026-10-20","end":"2026-10-21","milestone":True}]},
    {"stages":[{"name":"bad","start":"2026-10-20","end":"2026-10-21","allocation":101}]},
    {"stages":[{"id":"s","name":"a","start":"2026-10-20","end":"2026-10-20"},{"id":"s","name":"b","start":"2026-10-20","end":"2026-10-20"}]},
])
def test_invalid_plans_rejected_without_writes(env,patch_body):
    http,_=env
    assert http.post("/management/projects?year=2026",headers=headers(),json={"name":"项目",**patch_body}).status_code == 422
    assert http.get("/management/projects?year=2026",headers=headers()).json() == []


def test_inactive_staff_preserves_old_plans_but_no_new_assignment_and_staff_conflicts(env):
    http,_=env
    s=new_staff(http); p=project(http,next_week_staff=[s["id"]])
    body={k:v for k,v in s.items() if k != "id"}
    assert http.put(f"/management/staff/{s['id']}",headers=headers(),json={**body,"is_active":False}).status_code==200
    assert http.put(f"/management/staff/{s['id']}",headers=headers(),json=body).status_code==409
    assert http.put(f"/management/projects/{p['id']}",headers=headers(),json=payload(p)).status_code==200
    assert http.post("/management/projects?year=2026",headers=headers(),json={"name":"新项目","next_week_staff":[s["id"]]}).status_code==422


def test_report_optimistic_version_and_no_fake_data_on_get(env):
    http,sessions=env
    r=http.get("/management/reports/2026",headers=headers()).json(); assert r["version"]==0 and r["compiler"]==""
    body={"compiler":"编制人","data_as_of":"2026-10-12","version":0}
    r=http.put("/management/reports/2026",headers=headers(),json=body); assert r.status_code==200 and r.json()["version"]==1
    assert http.put("/management/reports/2026",headers=headers(),json=body).status_code==409
    assert http.get("/management/reports/2026",headers=headers(4)).json()["version"]==0


def test_migration_repeatable_preserves_users_projects_and_no_implicit_grants():
    path=Path(__file__).parents[1]/"migrations/versions/a16c9e74b821_company_planning.py"
    spec=importlib.util.spec_from_file_location("planning_migration",path); migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("create table users (id integer primary key, role varchar(50), group_name varchar(120))"))
        conn.execute(sa.text("insert into users values (1,'admin','fourth'),(2,'designer','second')"))
        conn.execute(sa.text("create table projects (id integer primary key, name text)"));conn.execute(sa.text("insert into projects values(1,'history')"))
        with patch.object(migration,"op",Operations(MigrationContext.configure(conn))): migration.upgrade();migration.upgrade()
        assert conn.execute(sa.text("select id, role, group_name, company_management, company_unit from users order by id")).all()==[(1,"admin","fourth",0,""),(2,"designer","second",0,"")]
        assert conn.execute(sa.text("select name from projects")).scalar_one()=="history"
        assert conn.execute(sa.text("select count(*) from management_projects")).scalar_one()==0
    engine.dispose()
