from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Workflow
from app.schemas import WorkflowOut

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowOut])
def list_workflows(db: Session = Depends(get_db)) -> list[Workflow]:
    return list(db.scalars(select(Workflow).order_by(Workflow.priority, Workflow.name)).all())
