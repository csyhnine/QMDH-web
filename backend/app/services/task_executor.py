from __future__ import annotations

from dataclasses import asdict, dataclass
from random import randint, uniform

from redis import Redis
from sqlalchemy import select

from app.core.config import settings
from app.database import SessionLocal
from app.models import Project, ProviderCall, Task, TaskStatus, Workflow
from app.services.model_registry import PROVIDERS, ProviderDefinition


@dataclass(frozen=True)
class ExecutionOutcome:
    model_name: str
    latency_ms: int
    cost: float
    outbound: bool
    result: dict


class ProviderAdapter:
    def __init__(self, definition: ProviderDefinition):
        self.definition = definition

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        raise NotImplementedError


class SimulatedProviderAdapter(ProviderAdapter):
    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        base_latency = {
            "image.generate": randint(18_000, 45_000),
            "image.edit": randint(12_000, 30_000),
            "document.generate": randint(4_000, 9_000),
            "text.generate": randint(2_000, 6_000),
            "video.generate": randint(60_000, 120_000),
        }
        base_cost = {
            "image.generate": uniform(2.5, 8.5),
            "image.edit": uniform(1.8, 5.0),
            "document.generate": uniform(0.4, 2.2),
            "text.generate": uniform(0.2, 1.4),
            "video.generate": uniform(12.0, 35.0),
        }
        latency_ms = base_latency.get(capability, 3_000)
        cost = round(base_cost.get(capability, 1.0), 2)
        result = {
            "summary": f"{self.definition.provider_name} 已完成 {capability} 的模拟执行。",
            "payload_keys": list(payload.keys()),
            "adapter_mode": "simulated",
        }
        return ExecutionOutcome(
            model_name=self.definition.model_name,
            latency_ms=latency_ms,
            cost=cost,
            outbound=self.definition.outbound,
            result=result,
        )


def get_provider_adapter(provider_name: str) -> ProviderAdapter:
    definition = PROVIDERS[provider_name]
    return SimulatedProviderAdapter(definition)


def execute_task(task_id: int) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return

        workflow = db.scalar(select(Workflow).where(Workflow.id == task.workflow_id))
        project = db.scalar(select(Project).where(Project.id == task.project_id))
        if not workflow or not project:
            task.status = TaskStatus.failed
            task.result = {"error": "Task dependencies not found"}
            db.commit()
            return

        task.status = TaskStatus.running
        db.commit()

        try:
            adapter = get_provider_adapter(task.requested_provider)
            outcome = adapter.execute(workflow.provider_capability, task.payload)
            task.status = TaskStatus.completed
            task.latency_ms = outcome.latency_ms
            task.cost = outcome.cost
            task.result = outcome.result

            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name=task.requested_provider,
                    model_name=outcome.model_name,
                    capability=workflow.provider_capability,
                    cost=outcome.cost,
                    latency_ms=outcome.latency_ms,
                    outbound=outcome.outbound,
                    request_summary={
                        "classification": task.classification.value,
                        "project_code": project.code,
                        "keys": list(task.payload.keys()),
                        "execution": asdict(outcome),
                    },
                )
            )
        except Exception as exc:
            task.status = TaskStatus.failed
            task.result = {"error": str(exc)}

        db.commit()


def enqueue_task(task_id: int) -> None:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    client.lpush(settings.redis_queue_name, str(task_id))
