from __future__ import annotations

from dataclasses import dataclass
from app.services.model_registry import ProviderDefinition


@dataclass(frozen=True)
class ExecutionOutcome:
    model_name: str
    latency_ms: int
    cost: float
    cost_currency: str
    outbound: bool
    result: dict


@dataclass(frozen=True)
class RequestDiagnostics:
    strategy: str
    endpoint_path: str
    request_url: str
    timeout_seconds: float
    adapter_mode: str
    effective_capability: str


class ProviderExecutionError(Exception):
    def __init__(self, message: str, *, diagnostics: RequestDiagnostics):
        super().__init__(message)
        self.diagnostics = diagnostics


class ProviderAdapter:
    def __init__(self, definition: ProviderDefinition):
        self.definition = definition

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        raise NotImplementedError
