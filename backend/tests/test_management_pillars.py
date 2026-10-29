from tests.test_management import env, headers, new_staff, project, payload


def setup_plans(http):
    person = new_staff(http)
    original = project(http, name="原项目", stages=[{"id":"work","name":"方案工作","start":"2026-10-26","end":"2026-10-30","assignees":[person["id"]]}])
    target = project(http, name="紧急项目")
    request = {"source_project_id":original["id"],"source_stage_id":"work","source_version":original["version"],
        "target_project_id":target["id"],"target_version":target["version"],"person_id":person["id"],
        "start":"2026-10-27","end":"2026-10-28","work":"紧急汇报"}
    return original, target, request


def test_reassign_commits_both_plans_and_revisions_preserving_original_dates(env):
    http, _ = env
    original, target, body = setup_plans(http)
    response = http.post("/management/assignments/reassign",headers=headers(),json=body)
    assert response.status_code == 200, response.text
    a,b = response.json()["projects"]
    assert a["version"] == b["version"] == 2
    old = a["stages"][0]
    assert (old["start"],old["end"],old["assignees"]) == ("2026-10-26","2026-10-30",[body["person_id"]])
    assert old["pauses"][0]["until"] == "2026-10-29"
    assert b["stages"][0]["start"] == "2026-10-27" and b["stages"][0]["end"] == "2026-10-28"
    assert b["stages"][0]["name"] == "紧急汇报"
    for p in (a,b): assert len(http.get(f"/management/projects/{p['id']}/revisions",headers=headers()).json()) == 2
    body.update(source_version=2,target_version=2)
    assert http.post("/management/assignments/reassign",headers=headers(),json=body).status_code == 422


def test_stale_target_and_capacity_errors_never_leave_half_a_reassignment(env):
    http, _ = env
    a,b,body = setup_plans(http)
    changed=http.put(f"/management/projects/{b['id']}",headers=headers(),json={**payload(b),"name":"已更新"})
    assert changed.status_code == 200
    assert http.post("/management/assignments/reassign",headers=headers(),json=body).status_code == 409
    saved=http.get("/management/projects?year=2026",headers=headers()).json()
    assert saved[0]["version"] == 1 and not saved[0]["stages"][0]["pauses"]
    assert saved[1]["version"] == 2 and saved[1]["stages"] == []
    b=changed.json();b=http.put(f"/management/projects/{b['id']}",headers=headers(),json={**payload(b),"stages":[{"id":f"s{i}","name":"existing","start":"2026-10-27","end":"2026-10-28"} for i in range(200)]}).json()
    body['target_version']=b['version']
    assert http.post("/management/assignments/reassign",headers=headers(),json=body).status_code == 422
    saved=http.get("/management/projects?year=2026",headers=headers()).json()
    assert saved[0]['version']==1 and len(saved[1]['stages'])==200


def test_reassignment_enforces_unit_staff_range_and_archive_rules(env):
    http, _ = env
    a,b,body=setup_plans(http)
    assert http.post("/management/assignments/reassign",headers=headers(4),json=body).status_code==404
    foreign=new_staff(http,id=4)
    for patch in ({'person_id':foreign['id']},{'start':'2026-10-25'},{'end':'2026-10-31'},{'end':'2026-10-26'},{'target_project_id':a['id']}):
        assert http.post("/management/assignments/reassign",headers=headers(),json={**body,**patch}).status_code==422
    http.put(f"/management/projects/{b['id']}",headers=headers(),json={**payload(b),'archived':True})
    assert http.post("/management/assignments/reassign",headers=headers(),json=body).status_code==422


def test_weekly_handwritten_briefs_persist_and_old_clients_preserve_them(env):
    http, _ = env
    a=project(http,weekly_briefs=[{'week_start':'2026-10-26','previous':'手写上周完成内容','following':'手写下周安排'}])
    old=payload(a);old.pop('weekly_briefs')
    b=http.put(f"/management/projects/{a['id']}",headers=headers(),json={**old,'name':'旧端改名'}).json()
    assert b['weekly_briefs']==a['weekly_briefs']
    assert http.put(f"/management/projects/{a['id']}",headers=headers(),json={**payload(b),'weekly_briefs':[{'week_start':'2026-10-27'}]}).status_code==422
    assert http.put(f"/management/projects/{a['id']}",headers=headers(),json={**payload(b),'weekly_briefs':a['weekly_briefs']*2}).status_code==422
