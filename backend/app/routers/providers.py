from fastapi import APIRouter

from app.schemas import ProviderCapability
from app.services.model_registry import list_provider_capabilities

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=list[ProviderCapability])
def get_providers() -> list[ProviderCapability]:
    return [
        ProviderCapability(
            provider_name=item.provider_name,
            model_name=item.model_name,
            capabilities=item.capabilities,
            configurable=item.configurable,
            outbound=item.outbound,
        )
        for item in list_provider_capabilities()
    ]
