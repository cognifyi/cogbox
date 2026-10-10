from __future__ import annotations

# flake8: noqa

# import apis into api package
import importlib
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cogbox_toolbox_api_client.api.computer_use_api import ComputerUseApi
    from cogbox_toolbox_api_client.api.file_system_api import FileSystemApi
    from cogbox_toolbox_api_client.api.git_api import GitApi
    from cogbox_toolbox_api_client.api.info_api import InfoApi
    from cogbox_toolbox_api_client.api.interpreter_api import InterpreterApi
    from cogbox_toolbox_api_client.api.lsp_api import LspApi
    from cogbox_toolbox_api_client.api.port_api import PortApi
    from cogbox_toolbox_api_client.api.process_api import ProcessApi
    from cogbox_toolbox_api_client.api.server_api import ServerApi


_DYNAMIC_IMPORTS: dict[str, str] = {
    "ComputerUseApi": "cogbox_toolbox_api_client.api.computer_use_api",
    "FileSystemApi": "cogbox_toolbox_api_client.api.file_system_api",
    "GitApi": "cogbox_toolbox_api_client.api.git_api",
    "InfoApi": "cogbox_toolbox_api_client.api.info_api",
    "InterpreterApi": "cogbox_toolbox_api_client.api.interpreter_api",
    "LspApi": "cogbox_toolbox_api_client.api.lsp_api",
    "PortApi": "cogbox_toolbox_api_client.api.port_api",
    "ProcessApi": "cogbox_toolbox_api_client.api.process_api",
    "ServerApi": "cogbox_toolbox_api_client.api.server_api",

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
