"""Company planning data: deliberately separate from Studio projects and site roles."""
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import ManagementProject, ManagementReport, ManagementRevision, ManagementStaff, User

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


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class StaffInput(StrictModel):
    name: str = Field(min_length=1, max_length=150)
    position: str = Field(default="", max_length=120)
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
    return dict(id=row.id, name=row.name, position=row.position, is_active=row.is_active, version=row.version)


def project_out(row):
    return dict(**row.document, id=row.id, year=row.year, unit=row.unit, version=row.version,
                archived=row.archived, updated_at=row.updated_at, updated_by=row.updated_by)


def get_project(db, user, project_id):
    row = db.scalar(select(ManagementProject).where(ManagementProject.id == project_id, ManagementProject.unit == user.company_unit))
    if not row:
        raise HTTPException(404, "项目不存在")
    return row


def validate_staff(db, user, payload, old=None):
    def used(doc):
        return set(doc.get("next_week_staff", [])) | {i for ids in doc.get("team", {}).values() for i in ids} | {i for stage in doc.get("stages", []) for i in stage["assignees"]}
    ids = used(payload.model_dump(mode="json"))
    if not ids:
        return
    rows = db.scalars(select(ManagementStaff).where(ManagementStaff.unit == user.company_unit, ManagementStaff.id.in_(ids))).all()
    if ids != {s.id for s in rows}:
        raise HTTPException(422, "人员不属于本单位或已不存在，请刷新人员名单")
    previous = used(old or {})
    if any(not s.is_active and s.id not in previous for s in rows):
        raise HTTPException(422, "不能新增分配已停用人员")


@router.get("/staff")
def list_staff(user: User = Depends(manager), db: Session = Depends(get_db)):
    return [staff_out(s) for s in db.scalars(select(ManagementStaff).where(ManagementStaff.unit == user.company_unit).order_by(ManagementStaff.id)).all()]


@router.post("/staff", status_code=201)
def create_staff(payload: StaffInput, user: User = Depends(manager), db: Session = Depends(get_db)):
    # Deliberately permit people without website accounts; staffing and login authorization are independent.
    row = ManagementStaff(unit=user.company_unit, name=payload.name, position=payload.position, is_active=payload.is_active)
    db.add(row)
    db.commit()
    db.refresh(row)
    return staff_out(row)


@router.put("/staff/{staff_id}")
def edit_staff(staff_id: int, payload: StaffInput, user: User = Depends(manager), db: Session = Depends(get_db)):
    result = db.execute(update(ManagementStaff).where(ManagementStaff.id == staff_id, ManagementStaff.unit == user.company_unit,
        ManagementStaff.version == payload.version).values(name=payload.name, position=payload.position,
        is_active=payload.is_active, version=payload.version + 1))
    if not result.rowcount:
        raise HTTPException(409, "人员已被修改，请刷新")
    db.commit()
    return staff_out(db.get(ManagementStaff, staff_id))


@router.get("/reports/{year}")
def report(year: int, user: User = Depends(manager), db: Session = Depends(get_db)):
    year_value(year)
    row = db.scalar(select(ManagementReport).where(ManagementReport.unit == user.company_unit, ManagementReport.year == year))
    return dict(unit=user.company_unit, year=year, version=row.version if row else 0,
                compiler=row.document.get("compiler", "") if row else "",
                data_as_of=row.document.get("data_as_of") if row else None,
                updated_at=row.updated_at if row else None)


@router.put("/reports/{year}")
def edit_report(year: int, payload: ReportInput, user: User = Depends(manager), db: Session = Depends(get_db)):
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
def projects(year: int = Query(ge=2000, le=2100), archived: bool = False,
             user: User = Depends(manager), db: Session = Depends(get_db)):
    rows = db.scalars(select(ManagementProject).where(ManagementProject.unit == user.company_unit,
        ManagementProject.year == year, ManagementProject.archived == archived).order_by(ManagementProject.id).limit(1001)).all()
    if len(rows) > 1000:
        raise HTTPException(422, "当前年度项目超过 1000 项，请联系维护人员扩展分页")
    return sorted([project_out(r) for r in rows], key=lambda r: (r["sequence"], r["id"]))


def save_project(db, user, payload, row=None, year=None):
    validate_staff(db, user, payload, row.document if row else None)
    doc = payload.model_dump(mode="json", exclude={"version", "archived"})
    if row:
        result = db.execute(update(ManagementProject).where(ManagementProject.id == row.id,
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
    db.add(ManagementRevision(project_id=row.id, version=row.version, actor_id=user.id,
                              snapshot=dict(**doc, archived=row.archived)))
    db.commit()
    db.refresh(row)
    return project_out(row)


@router.post("/projects", status_code=201)
def create_project(payload: ProjectInput, year: int = Query(ge=2000, le=2100), user: User = Depends(manager), db: Session = Depends(get_db)):
    return save_project(db, user, payload, year=year)


@router.put("/projects/{project_id}")
def edit_project(project_id: int, payload: ProjectInput, user: User = Depends(manager), db: Session = Depends(get_db)):
    return save_project(db, user, payload, row=get_project(db, user, project_id))


@router.get("/projects/{project_id}/revisions")
def revisions(project_id: int, user: User = Depends(manager), db: Session = Depends(get_db)):
    get_project(db, user, project_id)
    return [dict(version=r.version, actor_id=r.actor_id, created_at=r.created_at, snapshot=r.snapshot)
            for r in db.scalars(select(ManagementRevision).where(ManagementRevision.project_id == project_id)
                                .order_by(ManagementRevision.version.desc()).limit(50)).all()]
