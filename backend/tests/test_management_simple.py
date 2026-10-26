from tests.test_management import env, headers, new_staff, project, payload


def test_initial_color_pause_deliverable_and_updates_survive_old_client_edits(env):
    http, _ = env
    staff = new_staff(http)
    stage = {'id':'work','name':'原工作','start':'2026-10-26','end':'2026-10-30','assignees':[staff['id']],
        'deliverable':'方案PDF','pauses':[{'id':'pause','start':'2026-10-27','until':None,'people':[staff['id']],'reason':'紧急支援'}],
        'updates':[{'id':'update','date':'2026-10-23','note':'完成底图'}]}
    p = project(http, stages=[stage])
    assert p['color'].startswith('#') and len(p['color']) == 7
    old = payload(p)
    old.pop('color')
    for key in ('deliverable','pauses','updates'): old['stages'][0].pop(key)
    saved = http.put(f"/management/projects/{p['id']}", headers=headers(), json={**old,'name':'旧客户端改名称'}).json()
    assert saved['color'] == p['color']
    assert saved['stages'][0]['pauses'][0]['people'] == [staff['id']]
    assert saved['stages'][0]['deliverable'] == '方案PDF'
    assert saved['stages'][0]['updates'][0]['note'] == '完成底图'


def test_pause_people_remain_unit_scoped_and_invalid_dates_or_colors_rejected(env):
    http, _ = env
    foreign = new_staff(http, '外院', id=4)
    stage = {'name':'工作','start':'2026-10-26','end':'2026-10-30','pauses':[{'start':'2026-10-27','people':[foreign['id']],'reason':'支援'}]}
    assert http.post('/management/projects?year=2026', headers=headers(), json={'name':'项目','stages':[stage]}).status_code == 422
    stage['pauses'][0].update({'people':[],'until':'2026-10-26'})
    assert http.post('/management/projects?year=2026', headers=headers(), json={'name':'项目','stages':[stage]}).status_code == 422
    assert http.post('/management/projects?year=2026', headers=headers(), json={'name':'项目','color':'url(evil)'}).status_code == 422
