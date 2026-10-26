"""Company planning data: deliberately separate from Studio projects and site roles."""
from datetime import date, timedelta
from dataclasses import dataclass
from decimal import Decimal
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AuditLog, ManagementProject, ManagementReport, ManagementRevision, ManagementStaff, ManagementWeeklySnapshot, User
from app.services.management_units import PLANNING_UNITS, account_unit, canonical_unit, sync_staff, unit_aliases

router = APIRouter(prefix="/management", tags=["company-management"])


def manager(response: Response, authorization: str | None = Header(default=None),
            auth: AuthUserProfile = Depends(get_current_auth_user), db: Session = Depends(get_db)) -> User:
    # Financial records require a current personal login, never a legacy shared API profile.
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(403, "请使用个人账号登录")
    user = db.get(User, auth.user_id) if auth.user_id else None
    if not user or not user.is_active or not user.company_management or not user.company_unit.strip():
        raise HTTPException(403, "仅公司管理层可访问项目管理")
    response.headers["Cache-Control"] = "no-store"
    return user


@dataclass
class PlanningScope:
    id: int
    company_unit: str


def planning_scope(unit: str | None = Query(default=None, max_length=120), user: User = Depends(manager)):
    own = canonical_unit(user.company_unit)
    selected = canonical_unit(unit) if unit else own
    # A site role alone never grants access. Only an already authorized company admin can switch.
    if selected != own and not (user.company_management and user.role == "admin" and selected in PLANNING_UNITS):
        raise HTTPException(403, "只能管理已授权的分院")
    return PlanningScope(user.id, selected)


@router.get("/units")
def list_units(user: User = Depends(manager), db: Session = Depends(get_db)):
    allowed = PLANNING_UNITS if user.role == "admin" else (canonical_unit(user.company_unit),)
    staff = db.scalars(select(ManagementStaff)).all() if user.role == "admin" else db.scalars(
        select(ManagementStaff).where(ManagementStaff.unit.in_(unit_aliases(user.company_unit)))).all()
    people = db.scalars(select(User)).all()
    return {"current_unit": canonical_unit(user.company_unit), "units": [
        {"name": unit, "label": "二分院（原二、四分院）" if unit == "二分院" else unit,
         "staff_count": sum(canonical_unit(s.unit) == unit and s.is_active for s in staff),
         "account_count": sum(account_unit(u) == unit for u in people)} for unit in allowed]}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StaffInput(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    position: str = Field(default="", max_length=120)
    employment_type: Literal["internal", "external", "unknown"] = "unknown"
    employer: str = Field(default="", max_length=150)
    is_active: bool = True
    version: int = Field(default=0, ge=0)


class ReportInput(StrictModel):
    compiler: str = Field(default="", max_length=150)
    data_as_of: date
    version: int = Field(default=0, ge=0)


Ids = Annotated[list[Annotated[int, Field(gt=0)]], Field(max_length=200)]
Money = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class Team(StrictModel):
    coordinator: Ids = Field(default_factory=list)
    design_manager: Ids = Field(default_factory=list)
    deputy_manager: Ids = Field(default_factory=list)
    business_manager: Ids = Field(default_factory=list)
    onsite: Ids = Field(default_factory=list)
    participants: Ids = Field(default_factory=list)


class WorkPause(StrictModel):
    id: str = Field(default_factory=lambda: uuid4().hex, max_length=64)
    start: date
    until: date | None = None
    people: Ids = Field(default_factory=list)
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def dates(self):
        if self.until is not None and self.until < self.start:
            raise ValueError("恢复日期不能早于暂停日期")
        return self


class WorkUpdate(StrictModel):
    id: str = Field(default_factory=lambda: uuid4().hex, max_length=64)
    date: date
    note: str = Field(min_length=1, max_length=1000)


class Stage(StrictModel):
    id: str = Field(default_factory=lambda: uuid4().hex, min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=250)
    start: date
    end: date
    assignees: Ids = Field(default_factory=list)
    progress: int = Field(default=0, ge=0, le=100)
    allocation: int = Field(default=100, ge=1, le=100)
    milestone: bool = False
    notes: str = Field(default="", max_length=2000)
    deliverable: str = Field(default="", max_length=1000)
    pauses: list[WorkPause] = Field(default_factory=list, max_length=100)
    updates: list[WorkUpdate] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end < self.start or (self.end - self.start).days > 3660:
            raise ValueError("阶段结束日期须不早于开始日期，跨度不能超过十年")
        if self.milestone and self.end != self.start:
            raise ValueError("里程碑的起止日期须相同")
        if len(set(self.assignees)) != len(self.assignees):
            raise ValueError("阶段人员不可重复")
        return self


class ProjectInput(StrictModel):
    name: str = Field(min_length=1, max_length=250)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sequence: int = Field(default=1, ge=1, le=100000)
    team: Team = Field(default_factory=Team)
    next_week_work: str = Field(default="", max_length=4000)
    next_week_staff: Ids = Field(default_factory=list)
    stage_work: str = Field(default="", max_length=4000)
    deadline: date | None = None
    grade: str = Field(default="", max_length=100)
    urgency: Literal["常规", "重要", "紧急", "特急"] = "常规"
    investment: Money | None = None
    design_fee: Money | None = None
    contract: str = Field(default="", max_length=500)
    contract_status: Literal["signed", "unsigned", "unknown"] = "unknown"
    weekly_plan_mode: Literal["manual", "schedule"] = "manual"
    collaboration_unit: Literal["", "一分院", "二分院", "三分院", "其他分院"] = ""
    paid: Money | None = None
    invoiced_pending: Money | None = None
    mode: str = Field(default="", max_length=250)
    source: str = Field(default="", max_length=250)
    project_type: str = Field(default="", max_length=250)
    phase: str = Field(default="", max_length=250)
    notes: str = Field(default="", max_length=4000)
    stages: list[Stage] = Field(default_factory=list, max_length=200)
    archived: bool = False
    version: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def unique_stages(self):
        if len({s.id for s in self.stages}) != len(self.stages):
            raise ValueError("阶段 ID 重复")
        return self


def year_value(year: int):
    if not 2000 <= year <= 2100:
        raise HTTPException(422, "年度范围为 2000–2100")


def staff_out(row):
    return dict(id=row.id, name=row.name, position=row.position, employment_type=row.employment_type,
                employer=row.employer, is_active=row.is_active, version=row.version)


def project_out(row):
    doc = {"contract_status": "unknown", "weekly_plan_mode": "manual", "collaboration_unit": "", **row.document}
    doc["color"] = doc.get("color") or ("#386bcc", "#16806b", "#9b5ab4", "#b16e22", "#b74f6e", "#527785")[row.id % 6]
    return dict(**doc, id=row.id, year=row.year, unit=canonical_unit(row.unit), version=row.version,
                archived=row.archived, deleted=row.deleted, updated_at=row.updated_at, updated_by=row.updated_by)


def get_project(db, user, project_id, *, include_deleted=False):
    row = db.scalar(select(ManagementProject).where(ManagementProject.id == project_id, ManagementProject.unit.in_(unit_aliases(user.company_unit))))
    if not row or (row.deleted and not include_deleted):
        raise HTTPException(404, "项目不存在")
    return row


def validate_staff(db, user, payload, old=None):
    def used(doc):
        return set(doc.get("next_week_staff", [])) | {i for ids in doc.get("team", {}).values() for i in ids} | {i for stage in doc.get("stages", []) for i in stage["assignees"]} | {i for stage in doc.get("stages", []) for pause in stage.get("pauses", []) for i in pause["people"]}
    ids = used(payload.model_dump(mode="json"))
    if not ids:
        return
    rows = db.scalars(select(ManagementStaff).where(ManagementStaff.unit.in_(unit_aliases(user.company_unit)), ManagementStaff.id.in_(ids))).all()
    if ids != {s.id for s in rows}:
        raise HTTPException(422, "人员不属于本单位或已不存在，请刷新人员名单")
    previous = used(old or {})
    if any(not s.is_active and s.id not in previous for s in rows):
        raise HTTPException(422, "不能新增分配已停用人员")


@router.get("/staff")
def list_staff(user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return [staff_out(s) for s in db.scalars(select(ManagementStaff).where(ManagementStaff.unit.in_(unit_aliases(user.company_unit))).order_by(ManagementStaff.id)).all()]


@router.post("/staff", status_code=201)
def create_staff(payload: StaffInput, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    # Deliberately permit people without website accounts; staffing and login authorization are independent.
    row = ManagementStaff(unit=user.company_unit, name=payload.name, position=payload.position,
                          employment_type=payload.employment_type, employer=payload.employer, is_active=payload.is_active)
    db.add(row)
    db.commit()
    db.refresh(row)
    return staff_out(row)


@router.post("/staff/sync")
def import_staff(user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    result = sync_staff(db, user.company_unit)
    db.add(AuditLog(event_type="management.roster_synced", actor_name="company-manager", actor_id=user.id,
                    target_type="management_unit", target_name=user.company_unit, details=result))
    db.commit()
    return result


@router.put("/staff/{staff_id}")
def edit_staff(staff_id: int, payload: StaffInput, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    affiliation = {key: getattr(payload, key) for key in ("employment_type", "employer") if key in payload.model_fields_set}
    result = db.execute(update(ManagementStaff).where(ManagementStaff.id == staff_id, ManagementStaff.unit.in_(unit_aliases(user.company_unit)),
        ManagementStaff.version == payload.version).values(name=payload.name, position=payload.position,
        is_active=payload.is_active, version=payload.version + 1, **affiliation))
    if not result.rowcount:
        raise HTTPException(409, "人员已被修改，请刷新")
    db.commit()
    return staff_out(db.get(ManagementStaff, staff_id))


@router.get("/reports/{year}")
def report(year: int, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    year_value(year)
    row = db.scalar(select(ManagementReport).where(ManagementReport.unit == user.company_unit, ManagementReport.year == year))
    return dict(unit=user.company_unit, year=year, version=row.version if row else 0,
                compiler=row.document.get("compiler", "") if row else "",
                data_as_of=row.document.get("data_as_of") if row else None,
                updated_at=row.updated_at if row else None)


@router.put("/reports/{year}")
def edit_report(year: int, payload: ReportInput, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    year_value(year)
    doc = payload.model_dump(mode="json", exclude={"version"})
    if payload.version == 0:
        db.add(ManagementReport(unit=user.company_unit, year=year, document=doc))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "台账已被修改，请刷新")
    else:
        result = db.execute(update(ManagementReport).where(ManagementReport.unit == user.company_unit,
            ManagementReport.year == year, ManagementReport.version == payload.version).values(document=doc, version=payload.version + 1))
        if not result.rowcount:
            raise HTTPException(409, "台账已被修改，请刷新")
        db.commit()
    return report(year, user, db)


@router.get("/projects")
def projects(year: int = Query(ge=2000, le=2100), archived: bool = False, deleted: bool = False,
             user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    rows = db.scalars(select(ManagementProject).where(ManagementProject.unit.in_(unit_aliases(user.company_unit)),
        ManagementProject.year == year, ManagementProject.deleted == deleted,
        *([] if deleted else [ManagementProject.archived == archived])).order_by(ManagementProject.id).limit(1001)).all()
    if len(rows) > 1000:
        raise HTTPException(422, "当前年度项目超过 1000 项，请联系维护人员扩展分页")
    return sorted([project_out(r) for r in rows], key=lambda r: (r["sequence"], r["id"]))


def reporting_data(db, user, year):
    rows = db.scalars(select(ManagementProject).where(
        ManagementProject.unit.in_(unit_aliases(user.company_unit)), ManagementProject.year == year,
        ManagementProject.deleted.is_(False)).order_by(ManagementProject.id).limit(1001)).all()
    if len(rows) > 1000:
        raise HTTPException(422, "当前年度项目超过统计容量，请联系维护人员扩展分页")
    return {"unit": canonical_unit(user.company_unit), "year": year,
            "projects": sorted([project_out(r) for r in rows], key=lambda r: (r["sequence"], r["id"])),
            "staff": list_staff(user, db), "report": report(year, user, db)}


@router.get("/report-data")
def get_reporting_data(year: int = Query(ge=2000, le=2100), user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return reporting_data(db, user, year)


class WeeklySnapshotInput(StrictModel):
    week_start: date
    week_days: Literal[5, 7] = 5

    @model_validator(mode="after")
    def monday(self):
        if self.week_start.weekday() != 0:
            raise ValueError("周报起始日期须为星期一")
        return self


def snapshot_meta(row):
    return {"id": row.id, "unit": canonical_unit(row.unit), "year": row.year,
            "week_start": row.week_start, "week_days": row.document["week_days"], "created_at": row.created_at}


@router.get("/weekly-snapshots")
def weekly_snapshots(year: int = Query(ge=2000, le=2100), week_start: date | None = None,
                     user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    rows = db.scalars(select(ManagementWeeklySnapshot).where(
        ManagementWeeklySnapshot.unit.in_(unit_aliases(user.company_unit)), ManagementWeeklySnapshot.year == year,
        *([] if week_start is None else [ManagementWeeklySnapshot.week_start == week_start]))
        .order_by(ManagementWeeklySnapshot.id.desc()).limit(100)).all()
    return [snapshot_meta(r) for r in rows]


@router.post("/weekly-snapshots", status_code=201)
def save_weekly_snapshot(payload: WeeklySnapshotInput, year: int = Query(ge=2000, le=2100),
                         user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    if payload.week_start > date(year, 12, 31) or payload.week_start + timedelta(days=payload.week_days - 1) < date(year, 1, 1):
        raise HTTPException(422, "所选周须与项目年度相交")
    # Capture a coherent set of project versions, names, affiliations and report metadata.
    # Concurrent project/staff edits acquire the same row locks through their UPDATEs.
    db.scalars(select(ManagementProject).where(ManagementProject.unit.in_(unit_aliases(user.company_unit)),
        ManagementProject.year == year).order_by(ManagementProject.id).with_for_update()).all()
    db.scalars(select(ManagementStaff).where(ManagementStaff.unit.in_(unit_aliases(user.company_unit)))
        .order_by(ManagementStaff.id).with_for_update()).all()
    document = jsonable_encoder({**reporting_data(db, user, year), **payload.model_dump(), "calculation_version": 1})
    row = ManagementWeeklySnapshot(unit=user.company_unit, year=year, week_start=payload.week_start,
                                   actor_id=user.id, document=document)
    db.add(row)
    db.flush()
    db.add(AuditLog(event_type="management.weekly_snapshot_created", actor_name="company-manager", actor_id=user.id,
                    target_type="weekly_snapshot", target_id=row.id, target_name=user.company_unit,
                    details={"year": year, "week_start": payload.week_start.isoformat(), "week_days": payload.week_days}))
    db.commit()
    return snapshot_meta(row)


@router.get("/weekly-snapshots/{snapshot_id}")
def weekly_snapshot(snapshot_id: int, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    row = db.scalar(select(ManagementWeeklySnapshot).where(ManagementWeeklySnapshot.id == snapshot_id,
        ManagementWeeklySnapshot.unit.in_(unit_aliases(user.company_unit))))
    if not row:
        raise HTTPException(404, "周报快照不存在")
    return {**snapshot_meta(row), "document": row.document}


def save_project(db, user, payload, row=None, year=None):
    validate_staff(db, user, payload, row.document if row else None)
    doc = payload.model_dump(mode="json", exclude={"version", "archived"})
    if row:
        for key in ("contract_status", "weekly_plan_mode", "collaboration_unit", "color"):
            if key not in payload.model_fields_set and key in row.document:
                doc[key] = row.document[key]
        old_stages = {s["id"]: s for s in row.document.get("stages", [])}
        for value, stage in zip(doc["stages"], payload.stages):
            for key in ("deliverable", "pauses", "updates"):
                if key not in stage.model_fields_set and key in old_stages.get(stage.id, {}):
                    value[key] = old_stages[stage.id][key]
        result = db.execute(update(ManagementProject).where(ManagementProject.id == row.id,
            ManagementProject.unit.in_(unit_aliases(user.company_unit)), ManagementProject.deleted.is_(False),
            ManagementProject.version == payload.version).values(document=doc, archived=payload.archived,
            version=payload.version + 1, updated_by=user.id))
        if not result.rowcount:
            raise HTTPException(409, "项目已被他人修改。请先保留输入内容，再关闭编辑并刷新，避免覆盖他人修改。")
        db.flush()
        db.refresh(row)
    else:
        row = ManagementProject(unit=user.company_unit, year=year, document=doc, archived=payload.archived, updated_by=user.id)
        db.add(row)
        db.flush()
        doc["color"] = doc.get("color") or ("#386bcc", "#16806b", "#9b5ab4", "#b16e22", "#b74f6e", "#527785")[row.id % 6]
        row.document = dict(doc)
    db.add(ManagementRevision(project_id=row.id, version=row.version, actor_id=user.id,
                              snapshot=dict(**doc, archived=row.archived)))
    db.commit()
    db.refresh(row)
    return project_out(row)


@router.post("/projects", status_code=201)
def create_project(payload: ProjectInput, year: int = Query(ge=2000, le=2100), user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return save_project(db, user, payload, year=year)


@router.put("/projects/{project_id}")
def edit_project(project_id: int, payload: ProjectInput, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return save_project(db, user, payload, row=get_project(db, user, project_id))


@router.get("/projects/{project_id}/revisions")
def revisions(project_id: int, user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    get_project(db, user, project_id, include_deleted=True)
    return [dict(version=r.version, actor_id=r.actor_id, created_at=r.created_at, snapshot=r.snapshot)
            for r in db.scalars(select(ManagementRevision).where(ManagementRevision.project_id == project_id)
                                .order_by(ManagementRevision.version.desc()).limit(50)).all()]


def set_deleted(db, user, project_id, version, deleted):
    row = get_project(db, user, project_id, include_deleted=True)
    result = db.execute(update(ManagementProject).where(ManagementProject.id == row.id,
        ManagementProject.unit.in_(unit_aliases(user.company_unit)), ManagementProject.version == version,
        ManagementProject.deleted == (not deleted)).values(deleted=deleted, version=version + 1, updated_by=user.id))
    if not result.rowcount:
        raise HTTPException(409, "项目状态已变化，请刷新后再操作")
    db.flush()
    db.refresh(row)
    db.add(ManagementRevision(project_id=row.id, version=row.version, actor_id=user.id,
        snapshot=dict(**row.document, archived=row.archived, deleted=deleted)))
    db.commit()
    db.refresh(row)
    return project_out(row)


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, version: int = Query(ge=1),
                   user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return set_deleted(db, user, project_id, version, True)


@router.post("/projects/{project_id}/restore")
def restore_project(project_id: int, version: int = Query(ge=1),
                    user: PlanningScope = Depends(planning_scope), db: Session = Depends(get_db)):
    return set_deleted(db, user, project_id, version, False)
