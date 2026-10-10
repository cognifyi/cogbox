# Copyright Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

"""Tests for cogbox.common.errors module."""

from __future__ import annotations

import pytest

from cogbox.common.errors import (
    CogboxError,
    CogboxNotFoundError,
    CogboxRateLimitError,
    CogboxTimeoutError,
    create_cogbox_error,
    error_class_from_status_code,
)


class TestCogboxError:
    def test_basic_error(self):
        err = CogboxError("something went wrong")
        assert str(err) == "something went wrong"
        assert err.status_code is None
        assert err.headers == {}

    def test_with_status_code(self):
        err = CogboxError("bad request", status_code=400)
        assert err.status_code == 400
        assert str(err) == "bad request"

    def test_with_headers(self):
        headers = {"X-RateLimit-Remaining": "0", "Retry-After": "60"}
        err = CogboxError("rate limited", status_code=429, headers=headers)
        assert err.status_code == 429
        assert err.headers["X-RateLimit-Remaining"] == "0"
        assert err.headers["Retry-After"] == "60"

    def test_is_exception(self):
        err = CogboxError("test")
        assert isinstance(err, Exception)

    def test_none_headers_becomes_empty_dict(self):
        err = CogboxError("msg", headers=None)
        assert err.headers == {}


class TestCogboxNotFoundError:
    def test_inherits_cogbox_error(self):
        err = CogboxNotFoundError("sandbox not found", status_code=404)
        assert isinstance(err, CogboxError)
        assert isinstance(err, Exception)
        assert err.status_code == 404

    def test_message(self):
        err = CogboxNotFoundError("not found")
        assert str(err) == "not found"


class TestCogboxRateLimitError:
    def test_inherits_cogbox_error(self):
        err = CogboxRateLimitError("rate limit exceeded", status_code=429)
        assert isinstance(err, CogboxError)
        assert err.status_code == 429

    def test_with_retry_header(self):
        err = CogboxRateLimitError(
            "rate limit",
            status_code=429,
            headers={"Retry-After": "30"},
        )
        assert err.headers["Retry-After"] == "30"


class TestCogboxTimeoutError:
    def test_inherits_cogbox_error(self):
        err = CogboxTimeoutError("operation timed out")
        assert isinstance(err, CogboxError)
        assert str(err) == "operation timed out"

    def test_with_status_code(self):
        err = CogboxTimeoutError("timeout", status_code=504)
        assert err.status_code == 504


class TestErrorHierarchy:
    def test_catch_all_with_base_class(self):
        errors = [
            CogboxError("base"),
            CogboxNotFoundError("not found"),
            CogboxRateLimitError("rate limit"),
            CogboxTimeoutError("timeout"),
        ]
        for err in errors:
            with pytest.raises(CogboxError):
                raise err

    def test_specific_catch(self):
        with pytest.raises(CogboxNotFoundError):
            raise CogboxNotFoundError("not found")

        with pytest.raises(CogboxRateLimitError):
            raise CogboxRateLimitError("rate limit")

        with pytest.raises(CogboxTimeoutError):
            raise CogboxTimeoutError("timeout")


class TestErrorFactories:
    def test_error_class_from_status_code(self):
        assert error_class_from_status_code(404) is CogboxNotFoundError
        assert error_class_from_status_code(None) is CogboxError

    def test_create_cogbox_error_uses_specific_subclass(self):
        error = create_cogbox_error("missing", status_code=404, error_code="NOT_FOUND")

        assert isinstance(error, CogboxNotFoundError)
        assert error.error_code == "NOT_FOUND"
