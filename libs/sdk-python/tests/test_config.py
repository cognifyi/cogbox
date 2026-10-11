# Copyright Daytona Platforms Inc.
# Copyright Cognifyi
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

from unittest.mock import patch

import pytest

from cogbox._utils.env import CogboxEnvReader


class TestCogboxEnvReader:
    def test_get_rejects_non_cogbox_variable_names(self):
        reader = CogboxEnvReader()

        with pytest.raises(ValueError, match="must start with 'COGBOX_'"):
            reader.get("OTHER_VAR")

    def test_runtime_env_takes_precedence(self, monkeypatch):
        monkeypatch.setenv("COGBOX_API_KEY", "runtime")

        with patch.object(
            CogboxEnvReader, "_load", side_effect=[{"COGBOX_API_KEY": "local"}, {"COGBOX_API_KEY": "env"}]
        ):
            reader = CogboxEnvReader()

        assert reader.get("COGBOX_API_KEY") == "runtime"

    def test_env_local_takes_precedence_over_env_file(self, monkeypatch):
        monkeypatch.delenv("COGBOX_API_KEY", raising=False)

        with patch.object(
            CogboxEnvReader, "_load", side_effect=[{"COGBOX_API_KEY": "local"}, {"COGBOX_API_KEY": "env"}]
        ):
            reader = CogboxEnvReader()

        assert reader.get("COGBOX_API_KEY") == "local"

    def test_get_returns_none_for_missing_variable(self, monkeypatch):
        monkeypatch.delenv("COGBOX_API_KEY", raising=False)

        with patch.object(CogboxEnvReader, "_load", side_effect=[{}, {}]):
            reader = CogboxEnvReader()

        assert reader.get("COGBOX_API_KEY") is None

    def test_load_filters_non_cogbox_and_none_values(self):
        with patch(
            "cogbox._utils.env.dotenv_values",
            return_value={"COGBOX_API_KEY": "key", "OTHER": "nope", "COGBOX_TARGET": None},
        ):
            assert CogboxEnvReader._load(".env") == {"COGBOX_API_KEY": "key"}
