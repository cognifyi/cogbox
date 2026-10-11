# Copyright 2025 Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class CogboxError(Exception):
    """Base error for Cogbox SDK.

    Example:
        ```python
        try:
            sandbox = cogbox.get("missing-sandbox")
        except CogboxError as exc:
            print(exc.status_code)
            print(exc.error_code)
            print(exc.message)
        ```

    Attributes:
        message (str): Error message
        status_code (int | None): HTTP status code if available
        error_code (str | None): Machine-readable error code if available
        headers (dict[str, Any]): Response headers
    """

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        headers: Mapping[str, Any] | None = None,
        error_code: str | None = None,
    ):
        """Initialize Cogbox error.

        Args:
            message (str): Error message
            status_code (int | None): HTTP status code if available
            headers (Mapping[str, Any] | None): Response headers if available
            error_code (str | None): Machine-readable error code if available
        """
        super().__init__(message)
        self.message: str = message
        self.status_code: int | None = status_code
        self.error_code: str | None = error_code
        self.headers: dict[str, Any] = dict(headers or {})


class CogboxNotFoundError(CogboxError):
    """Error for when a resource is not found (HTTP 404).

    Example:
        ```python
        try:
            sandbox.fs.download_file("/workspace/missing.txt")
        except CogboxNotFoundError as exc:
            print(exc.status_code)
        ```
    """


class CogboxAuthenticationError(CogboxError):
    """Error for when authentication fails (HTTP 401).

    Example:
        ```python
        try:
            for sandbox in cogbox.list():
                print(sandbox.id)
        except CogboxAuthenticationError as exc:
            print(exc.status_code)
        ```
    """


class CogboxAuthorizationError(CogboxError):
    """Error for when the request is forbidden (HTTP 403).

    Example:
        ```python
        try:
            cogbox.get("sandbox-without-access")
        except CogboxAuthorizationError as exc:
            print(exc.message)
        ```
    """


class CogboxRateLimitError(CogboxError):
    """Error for when rate limit is exceeded (HTTP 429).

    Example:
        ```python
        try:
            for sandbox in cogbox.list():
                print(sandbox.id)
        except CogboxRateLimitError as exc:
            print(exc.error_code)
        ```
    """


class CogboxConflictError(CogboxError):
    """Error for when a resource conflict occurs (HTTP 409).

    Example:
        ```python
        try:
            params = CreateSandboxFromSnapshotParams(name="existing-sandbox")
            cogbox.create(params)
        except CogboxConflictError as exc:
            print(exc.error_code)
        ```
    """


class CogboxValidationError(CogboxError):
    """Error for when input validation fails (HTTP 400 or client-side validation).

    Example:
        ```python
        try:
            Image.debian_slim("3.8")
        except CogboxValidationError as exc:
            print(exc.message)
        ```
    """


class CogboxTimeoutError(CogboxError):
    """Error for when a timeout occurs.

    Example:
        ```python
        try:
            sandbox.wait_for_sandbox_start(timeout=1)
        except CogboxTimeoutError as exc:
            print(exc.message)
        ```
    """


class CogboxConnectionError(CogboxError):
    """Error for when a network connection fails.

    Example:
        ```python
        try:
            pty_handle.wait_for_connection()
        except CogboxConnectionError as exc:
            print(exc.message)
        ```
    """


STATUS_CODE_TO_ERROR: dict[int, type[CogboxError]] = {
    400: CogboxValidationError,
    401: CogboxAuthenticationError,
    403: CogboxAuthorizationError,
    404: CogboxNotFoundError,
    409: CogboxConflictError,
    429: CogboxRateLimitError,
}


def error_class_from_status_code(status_code: int | None) -> type[CogboxError]:
    """Map an HTTP status code to the corresponding CogboxError subclass."""

    if status_code is None:
        return CogboxError

    return STATUS_CODE_TO_ERROR.get(status_code, CogboxError)


def create_cogbox_error(
    message: str,
    status_code: int | None = None,
    headers: Mapping[str, Any] | None = None,
    error_code: str | None = None,
) -> CogboxError:
    """Create the appropriate CogboxError subclass from structured error metadata."""

    error_cls = error_class_from_status_code(status_code)
    return error_cls(message, status_code=status_code, headers=headers, error_code=error_code)
