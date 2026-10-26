import importlib.util
from pathlib import Path
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import ManagementProject, ManagementWeeklySnapshot
from tests.test_management import env, headers, new_staff, payload, project


def test_reporting_scope_includes_archived_excludes_trash_and_never_leaks_other_unit(env):
    http, _ = env
    active = project(http, design_fee='0', contract='尚未确认', contract_status='unknown')
    archive = project(http, archived=True, investment='123.45')
    deleted = project(http)
    http.delete(f"/management/projects/{deleted['id']}?version=1", headers=headers())
    foreign = http.post('/management/projects?year=2026', headers=headers(4), json={'name':'外院私有','design_fee':'99'}).json()
    data = http.get('/management/report-data?year=2026', headers=headers()).json()
    assert {p['id'] for p in data['projects']} == {active['id'], archive['id']}
    assert all(p['unit'] == '二分院' for p in data['projects'])
    assert http.get('/management/report-data?year=2026&unit=外院', headers=headers()).status_code == 403
    assert http.get('/management/report-data?year=2025', headers=headers()).json()['projects'] == []
    assert http.get('/management/report-data?year=2026', headers=headers(1)).status_code == 403


def test_weekly_snapshot_is_immutable_scoped_and_retains_staff_and_project_versions(env):
    http, sessions = env
    s = new_staff(http, '原姓名')
    p = project(http, grade='A', contract_status='signed', weekly_plan_mode='schedule',
        stages=[{'name':'原工作','start':'2026-10-26','end':'2026-10-30','assignees':[s['id']]}])
    response = http.post('/management/weekly-snapshots?year=2026', headers=headers(), json={'week_start':'2026-10-26','week_days':5})
    assert response.status_code == 201, response.text
    ident = response.json()['id']; url = f'/management/weekly-snapshots/{ident}'
    original = http.get(url, headers=headers()).json()['document']
    assert original['projects'][0]['version'] == 1 and original['staff'][0]['name'] == '原姓名'
    assert original['week_start'] == '2026-10-26' and original['calculation_version'] == 1
    http.put(f"/management/projects/{p['id']}", headers=headers(), json={**payload(p),'stages':[]})
    http.put(f"/management/staff/{s['id']}", headers=headers(), json={k: ('新姓名' if k=='name' else v) for k,v in s.items() if k!='id'})
    assert http.get(url, headers=headers()).json()['document'] == original
    assert http.get(url, headers=headers(4)).status_code == 404
    assert http.get('/management/weekly-snapshots?year=2026', headers=headers(4)).json() == []
    assert http.put(url, headers=headers(), json={}).status_code == 405
    assert http.delete(url, headers=headers()).status_code == 405
    assert len(http.get('/management/weekly-snapshots?year=2026&week_start=2026-10-26', headers=headers()).json()) == 1
    with sessions() as db:
        assert db.scalar(sa.select(sa.func.count()).select_from(ManagementWeeklySnapshot)) == 1


def test_week_validation_and_old_client_preserves_new_structured_fields(env):
    http, _ = env
    p = project(http, contract_status='signed', weekly_plan_mode='schedule', collaboration_unit='一分院')
    old = {k:v for k,v in payload(p).items() if k not in ('contract_status','weekly_plan_mode','collaboration_unit')}
    saved = http.put(f"/management/projects/{p['id']}", headers=headers(), json={**old, 'name':'旧客户端编辑'}).json()
    assert saved['contract_status'] == 'signed' and saved['weekly_plan_mode'] == 'schedule' and saved['collaboration_unit'] == '一分院'
    for body in [{'week_start':'2026-10-27'},{'week_start':'2026-10-26','week_days':6},{'week_start':'2025-01-06'}]:
        assert http.post('/management/weekly-snapshots?year=2026', headers=headers(), json=body).status_code == 422
    assert http.post('/management/weekly-snapshots?year=2026', headers=headers(), json={'week_start':'2025-12-29'}).status_code == 201


def test_migration_adds_empty_snapshot_storage_without_rewriting_business_data():
    path = Path(__file__).parents[1]/'migrations/versions/b94de295f179_management_weekly_snapshots.py'
    spec = importlib.util.spec_from_file_location('weekly_upgrade', path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    engine = sa.create_engine('sqlite://')
    with engine.begin() as db:
        db.exec_driver_sql('create table users (id integer primary key)')
        db.exec_driver_sql('create table management_projects (id integer primary key, document text)')
        db.exec_driver_sql("insert into management_projects values (1,'original')")
        with patch.object(module,'op',Operations(MigrationContext.configure(db))): module.upgrade()
        assert db.exec_driver_sql('select count(*) from management_weekly_snapshots').scalar() == 0
        assert db.exec_driver_sql('select document from management_projects').scalar() == 'original'
    engine.dispose()
