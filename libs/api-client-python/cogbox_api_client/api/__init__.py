from __future__ import annotations

# flake8: noqa

# import apis into api package
import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cogbox_api_client.api.health_api import HealthApi
    from cogbox_api_client.api.admin_api import AdminApi
    from cogbox_api_client.api.api_keys_api import ApiKeysApi
    from cogbox_api_client.api.audit_api import AuditApi
    from cogbox_api_client.api.config_api import ConfigApi
    from cogbox_api_client.api.docker_registry_api import DockerRegistryApi
    from cogbox_api_client.api.jobs_api import JobsApi
    from cogbox_api_client.api.object_storage_api import ObjectStorageApi
    from cogbox_api_client.api.organizations_api import OrganizationsApi
    from cogbox_api_client.api.preview_api import PreviewApi
    from cogbox_api_client.api.regions_api import RegionsApi
    from cogbox_api_client.api.runners_api import RunnersApi
    from cogbox_api_client.api.sandbox_api import SandboxApi
    from cogbox_api_client.api.snapshots_api import SnapshotsApi
    from cogbox_api_client.api.toolbox_api import ToolboxApi
    from cogbox_api_client.api.users_api import UsersApi
    from cogbox_api_client.api.volumes_api import VolumesApi
    from cogbox_api_client.api.webhooks_api import WebhooksApi


_DYNAMIC_IMPORTS: dict[str, str] = {
    "HealthApi": "cogbox_api_client.api.health_api",
    "AdminApi": "cogbox_api_client.api.admin_api",
    "ApiKeysApi": "cogbox_api_client.api.api_keys_api",
    "AuditApi": "cogbox_api_client.api.audit_api",
    "ConfigApi": "cogbox_api_client.api.config_api",
    "DockerRegistryApi": "cogbox_api_client.api.docker_registry_api",
    "JobsApi": "cogbox_api_client.api.jobs_api",
    "ObjectStorageApi": "cogbox_api_client.api.object_storage_api",
    "OrganizationsApi": "cogbox_api_client.api.organizations_api",
    "PreviewApi": "cogbox_api_client.api.preview_api",
    "RegionsApi": "cogbox_api_client.api.regions_api",
    "RunnersApi": "cogbox_api_client.api.runners_api",
    "SandboxApi": "cogbox_api_client.api.sandbox_api",
    "SnapshotsApi": "cogbox_api_client.api.snapshots_api",
    "ToolboxApi": "cogbox_api_client.api.toolbox_api",
    "UsersApi": "cogbox_api_client.api.users_api",
    "VolumesApi": "cogbox_api_client.api.volumes_api",
    "WebhooksApi": "cogbox_api_client.api.webhooks_api",

}


def __getattr__(attr_name: str) -> object:
    module_path = _DYNAMIC_IMPORTS.get(attr_name)
    if module_path is None:
        raise AttributeError(f"module {__name__!r} has no attribute {attr_name!r}")
    mod = importlib.import_module(module_path)
    value = getattr(mod, attr_name)
    globals()[attr_name] = value
    return value


def __dir__() -> list[str]:
    return list(_DYNAMIC_IMPORTS.keys())
