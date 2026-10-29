from unittest.mock import patch
import importlib.util
from pathlib import Path

import sqlalchemy as sa
import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import ManagementProject, ManagementRevision, ManagementStaff, User
from app.services.management_units import canonical_unit, sync_staff
from tests.test_management import env, headers, new_staff, payload, project


def authorize_admin(sessions):
    with sessions() as db:
        user = db.get(User, 1)
        user.company_management = True
        user.company_position = "项目管理管理员"
        db.commit()


def test_categories_require_company_grant_and_only_authorized_admin_switches(env):
    http, sessions = env
    assert http.get('/management/units', headers=headers(1)).status_code == 403
    assert http.get('/management/staff?unit=一分院', headers=headers()).status_code == 403
    assert [u['name'] for u in http.get('/management/units', headers=headers()).json()['units']] == ['二分院']
    authorize_admin(sessions)
    assert [u['name'] for u in http.get('/management/units', headers=headers(1)).json()['units']] == ['一分院', '二分院', '三分院']
    assert all(u['label'] == u['name'] for u in http.get('/management/units', headers=headers(1)).json()['units'])
    p = http.post('/management/projects?year=2026&unit=一分院', headers=headers(1), json={'name':'一院项目'}).json()
    assert p['unit'] == '一分院'
    assert http.get('/management/projects?year=2026', headers=headers()).json() == []
    assert http.delete(f"/management/projects/{p['id']}?version=1", headers=headers()).status_code == 404
    assert http.put(f"/management/projects/{p['id']}?unit=一分院", headers=headers(), json=payload(p)).status_code == 403
    assert http.get('/management/staff?unit=行政中心', headers=headers(1)).status_code == 403
    with sessions() as db:
        db.get(User,1).company_management = False
        db.commit()
    assert http.get('/management/staff?unit=一分院', headers=headers(1)).status_code == 403


def test_different_institutes_cannot_share_staff_projects_reports_or_trash(env):
    http, sessions = env
    authorize_admin(sessions)
    first = http.post('/management/staff?unit=一分院', headers=headers(1), json={'name':'一院员工'}).json()
    second = new_staff(http, '二院员工')
    project_one = http.post('/management/projects?year=2026&unit=一分院', headers=headers(1), json={'name':'一院项目','next_week_staff':[first['id']]}).json()
    for path, method, body in [
        ('/management/projects?year=2026', 'post', {'name':'误分配','next_week_staff':[first['id']]}),
        ('/management/projects?year=2026&unit=一分院', 'post', {'name':'误分配','next_week_staff':[second['id']]}),
    ]:
        assert getattr(http, method)(path, headers=headers(1), json=body).status_code == 422
    for unit,expected in [('一分院',[first['id']]),('二分院',[second['id']]),('三分院',[])]:
        assert [s['id'] for s in http.get('/management/staff?unit='+unit,headers=headers(1)).json()] == expected
    assert http.get('/management/projects?year=2026&unit=三分院',headers=headers(1)).json()==[]
    assert http.get('/management/reports/2026?unit=一分院',headers=headers(1)).json()['version']==0
    assert http.put('/management/reports/2026?unit=一分院',headers=headers(1),json={'data_as_of':'2026-10-26','compiler':'一院'}).status_code==200
    assert http.get('/management/reports/2026',headers=headers()).json()['compiler']==''
    ident=project_one['id']
    assert http.get(f'/management/projects/{ident}/revisions',headers=headers()).status_code==404
    assert http.delete(f'/management/projects/{ident}?version=1',headers=headers()).status_code==404
    assert http.delete(f'/management/projects/{ident}?unit=一分院&version=1',headers=headers(1)).status_code==200
    assert http.get('/management/projects?year=2026&deleted=true',headers=headers()).json()==[]
    assert http.post(f'/management/projects/{ident}/restore?version=2',headers=headers()).status_code==404
    assert len(http.get('/management/projects?year=2026&deleted=true&unit=一分院',headers=headers(1)).json())==1


def test_import_merges_two_and_four_preserves_identity_manual_data_and_never_grants(env):
    http, sessions = env
    existing = new_staff(http, '已录领导')
    with sessions() as db:
        db.get(User,3).display_name = '已录领导'
        db.get(User,3).group_name = '城市更新二分院'
        for ident, name, group in [(20,'四院员工','城市更新四分院'),(21,'一院员工','城市更新一分院'),(22,'三院员工','城市更新三分院')]:
            db.add(User(id=ident, name=name, group_name=group, role='designer'))
        db.commit()
    first = http.post('/management/staff/sync', headers=headers()).json()
    assert first['matched'] == 1 and first['added'] == 1
    second = http.post('/management/staff/sync', headers=headers()).json()
    assert second['added'] == second['matched'] == 0
    roster = http.get('/management/staff', headers=headers()).json()
    assert {s['name'] for s in roster} == {'已录领导','四院员工'}
    assert next(s for s in roster if s['name'] == '已录领导')['id'] == existing['id']
    with sessions() as db:
        assert not db.get(User,20).company_management
        assert db.get(User,20).group_name == '城市更新四分院'
        assert db.get(ManagementStaff,existing['id']).source_user_id == 3
        db.get(ManagementStaff,existing['id']).name = '手工修订姓名'
        db.commit()
        assert sync_staff(db, '二分院')['added'] == 0
        db.rollback()
    assert canonical_unit('城市更新四分院') == '二分院'
    authorize_admin(sessions)
    for unit, name in [('一分院','一院员工'),('三分院','三院员工')]:
        result = http.post(f'/management/staff/sync?unit={unit}', headers=headers(1)).json()
        assert result['added'] == 1
        assert http.get(f'/management/staff?unit={unit}', headers=headers(1)).json()[0]['name'] == name


def test_duplicate_names_are_reported_instead_of_merging_people(env):
    http, sessions = env
    with sessions() as db:
        for ident in (20,21):
            db.add(User(id=ident,name=f'person{ident}',display_name='同名员工',group_name='城市更新四分院'))
        db.commit()
    result = http.post('/management/staff/sync', headers=headers()).json()
    assert result['conflicts'] == ['同名员工', '同名员工']
    assert '同名员工' not in {s['name'] for s in http.get('/management/staff', headers=headers()).json()}


def test_delete_restore_retains_assignments_revisions_and_stale_operations_fail(env):
    http, sessions = env
    staff = new_staff(http)
    p = project(http, team={'coordinator':[staff['id']]}, design_fee='12.34',
                stages=[{'name':'方案','start':'2026-10-26','end':'2026-10-28','assignees':[staff['id']]}])
    path = f"/management/projects/{p['id']}"
    assert http.delete(path, headers=headers()).status_code == 422
    assert http.delete(path+'?version=99', headers=headers()).status_code == 409
    deleted = http.delete(path+'?version=1', headers=headers()).json()
    assert deleted['deleted'] and deleted['version'] == 2
    assert http.get('/management/projects?year=2026', headers=headers()).json() == []
    assert http.get('/management/projects?year=2026&archived=true', headers=headers()).json() == []
    assert http.get('/management/projects?year=2026&deleted=true', headers=headers()).json()[0]['id'] == p['id']
    assert http.put(path, headers=headers(), json=payload(p)).status_code == 404
    assert http.post(path+'/restore?version=1', headers=headers()).status_code == 409
    restored = http.post(path+'/restore?version=2', headers=headers()).json()
    assert not restored['deleted'] and restored['version'] == 3
    assert restored['stages'] == p['stages'] and restored['team'] == p['team'] and restored['design_fee'] == '12.34'
    assert http.delete(path+'?version=1', headers=headers()).status_code == 409
    revisions = http.get(path+'/revisions', headers=headers()).json()
    assert len(revisions) == 3 and revisions[1]['snapshot']['deleted']
    with sessions() as db:
        assert db.scalar(sa.select(sa.func.count()).select_from(ManagementProject)) == 1
        assert db.scalar(sa.select(sa.func.count()).select_from(ManagementRevision)) == 3


def test_archived_project_returns_to_archive_after_restore(env):
    http, _ = env
    p = project(http, archived=True)
    path = f"/management/projects/{p['id']}"
    assert http.delete(path+'?version=1', headers=headers()).status_code == 200
    assert http.post(path+'/restore?version=2', headers=headers()).json()['archived']
    assert len(http.get('/management/projects?year=2026&archived=true', headers=headers()).json()) == 1


def test_migration_keeps_old_data_and_grants_and_adds_defaults():
    path = Path(__file__).parents[1]/'migrations/versions/f62ab073d957_management_categories_and_trash.py'
    spec = importlib.util.spec_from_file_location('management_upgrade', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine('sqlite://')
    with engine.begin() as db:
        db.exec_driver_sql('create table users (id integer primary key, company_management boolean, group_name text)')
        db.exec_driver_sql("insert into users values(1,0,'城市更新四分院')")
        db.exec_driver_sql('create table management_staff (id integer primary key, unit text, name text)')
        db.exec_driver_sql("insert into management_staff values(8,'二分院','已有员工')")
        db.exec_driver_sql('create table management_projects (id integer primary key, document text)')
        db.exec_driver_sql("insert into management_projects values(9,'original')")
        with patch.object(migration,'op',Operations(MigrationContext.configure(db))): migration.upgrade()
        assert db.exec_driver_sql('select name,source_user_id from management_staff').one() == ('已有员工',None)
        assert db.exec_driver_sql('select document,deleted from management_projects').one() == ('original',0)
        assert db.exec_driver_sql('select company_management,group_name from users').one() == (0,'城市更新四分院')
    engine.dispose()


@pytest.mark.parametrize('own', ['一分院', '二分院', '三分院'])
@pytest.mark.parametrize('role', ['designer', 'ops'])
def test_branch_managers_cannot_read_progress_export_snapshots_or_switch_by_forging_unit(env, own, role):
    http, sessions = env
    authorize_admin(sessions)
    plans, snapshots = {}, {}
    for unit in ('一分院', '二分院', '三分院'):
        plans[unit] = http.post('/management/projects?year=2026&unit='+unit, headers=headers(1), json={
            'name':unit+'私有项目', 'weekly_briefs':[{'week_start':'2026-10-26','previous':'私有推进','following':'私有计划'}],
            'stages':[{'id':'work','name':'私有工作','start':'2026-10-26','end':'2026-10-30','progress':70}],
        }).json()
        snapshots[unit] = http.post('/management/weekly-snapshots?year=2026&unit='+unit,
            headers=headers(1), json={'week_start':'2026-10-26'}).json()
    with sessions() as db:
        user = db.get(User, 3)
        user.role, user.company_unit = role, own
        db.commit()
    categories = http.get('/management/units', headers=headers()).json()['units']
    assert [(u['name'],u['label']) for u in categories] == [(own,own)]
    assert {p['id'] for p in http.get('/management/projects?year=2026',headers=headers()).json()} == {plans[own]['id']}
    assert {p['id'] for p in http.get('/management/report-data?year=2026',headers=headers()).json()['projects']} == {plans[own]['id']}
    assert {s['id'] for s in http.get('/management/weekly-snapshots?year=2026',headers=headers()).json()} == {snapshots[own]['id']}
    for foreign in set(plans)-{own}:
        for path in ('/projects?year=2026','/projects?year=2026&archived=true','/projects?year=2026&deleted=true',
                     '/staff','/reports/2026','/report-data?year=2026','/weekly-snapshots?year=2026'):
            separator = '&' if '?' in path else '?'
            assert http.get('/management'+path+separator+'unit='+foreign,headers=headers()).status_code == 403
        ident, snapshot = plans[foreign]['id'], snapshots[foreign]['id']
        assert http.get(f'/management/projects/{ident}/revisions',headers=headers()).status_code == 404
        assert http.get(f'/management/weekly-snapshots/{snapshot}',headers=headers()).status_code == 404
        assert http.put(f'/management/projects/{ident}',headers=headers(),json=payload(plans[foreign])).status_code == 404
        assert http.put(f'/management/projects/{ident}?unit={foreign}',headers=headers(),json=payload(plans[foreign])).status_code == 403
        assert http.delete(f'/management/projects/{ident}?version=1',headers=headers()).status_code == 404
        assert http.post('/management/projects?year=2026&unit='+foreign,headers=headers(),json={'name':'不可跨院立项'}).status_code == 403
        assert http.post('/management/assignments/reassign',headers=headers(),json={
            'source_project_id':plans[own]['id'],'source_stage_id':'work','source_version':1,
            'target_project_id':ident,'target_version':1,'person_id':1,'start':'2026-10-27','end':'2026-10-28',
        }).status_code == 404
    with sessions() as db:
        assert all(p.version == 1 for p in db.scalars(sa.select(ManagementProject)).all())
