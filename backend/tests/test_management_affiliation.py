from pathlib import Path
import importlib.util
from unittest.mock import patch

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

from app.models import User, ManagementStaff
from app.routers.users import _normalize_group_name
from tests.test_management import env, headers, project


def test_external_staff_can_be_assigned_without_creating_accounts_or_permissions(env):
    http, sessions = env
    with sessions() as db:
        accounts = [(u.id, u.company_management) for u in db.scalars(sa.select(User)).all()]
    response = http.post('/management/staff', headers=headers(), json={
        'name': '外部设计师', 'employment_type': 'external', 'employer': '测试合作单位'})
    assert response.status_code == 201
    staff = response.json()
    assert staff['employment_type'] == 'external' and staff['employer'] == '测试合作单位'
    p = project(http, stages=[{'name':'外包配合','start':'2026-10-26','end':'2026-10-27','assignees':[staff['id']]}])
    assert p['stages'][0]['assignees'] == [staff['id']]
    assert http.get('/management/staff', headers=headers(4)).json() == []
    assert http.post('/management/projects?year=2026', headers=headers(4), json={
        'name':'跨院错误安排','next_week_staff':[staff['id']]}).status_code == 422
    with sessions() as db:
        assert [(u.id, u.company_management) for u in db.scalars(sa.select(User)).all()] == accounts
        assert db.get(ManagementStaff, staff['id']).source_user_id is None


def test_old_clients_and_sync_preserve_verified_affiliation_and_departure(env):
    http, sessions = env
    with sessions() as db:
        user = db.get(User, 3)
        user.display_name = '已核实外包'
        user.group_name = '城市更新二分院'
        db.commit()
    staff = http.post('/management/staff', headers=headers(), json={
        'name':'已核实外包','employment_type':'external','employer':'测试公司'}).json()
    assert http.post('/management/staff/sync', headers=headers()).json()['matched'] == 1
    staff = http.get('/management/staff', headers=headers()).json()[0]
    # An older open client omits the new fields when editing another attribute.
    updated = http.put(f"/management/staff/{staff['id']}", headers=headers(), json={
        'name':staff['name'],'version':staff['version'],'is_active':False}).json()
    assert updated['employment_type'] == 'external' and updated['employer'] == '测试公司'
    http.post('/management/staff/sync', headers=headers())
    assert not http.get('/management/staff', headers=headers()).json()[0]['is_active']


def test_unverified_import_is_unknown_and_invalid_classification_is_rejected(env):
    http, sessions = env
    with sessions() as db:
        db.get(User,3).group_name = '城市更新四分院'
        db.commit()
    http.post('/management/staff/sync', headers=headers())
    assert http.get('/management/staff', headers=headers()).json()[0]['employment_type'] == 'unknown'
    assert http.post('/management/staff', headers=headers(), json={'name':'x','employment_type':'qmdh?'}).status_code == 422
    assert _normalize_group_name(' 城市更新四分院 ') == '城市更新二分院'
    assert _normalize_group_name('四分院') == '城市更新二分院'
    assert _normalize_group_name('城市更新三分院') == '城市更新三分院'


def test_migration_does_not_guess_employment_or_change_existing_identity():
    path = Path(__file__).parents[1]/'migrations/versions/a83cd184e068_management_staff_affiliation.py'
    spec = importlib.util.spec_from_file_location('affiliation_upgrade', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine('sqlite://')
    with engine.begin() as db:
        db.exec_driver_sql('create table management_staff (id integer primary key, name text, is_active boolean)')
        db.exec_driver_sql("insert into management_staff values(12,'原人员',0)")
        with patch.object(migration, 'op', Operations(MigrationContext.configure(db))): migration.upgrade()
        assert db.exec_driver_sql('select * from management_staff').one() == (12,'原人员',0,'unknown','')
    engine.dispose()
