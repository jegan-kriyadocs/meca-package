"""Environment-variable-sourced settings loader.

See 12_LLD_03_CONFIG_LOGGING_EXCEPTIONS.md §5 and
14_LLD_05_TESTING_DEPLOYMENT_STANDARDS.md §12.3: secrets and per-deployment
settings are sourced from the environment (populated by a secrets manager in
real deployments, or a local ``.env`` file in development — see
``.env.example``), never hard-coded in the version-controlled ``config/``
YAML tree.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

from meca_engine.config.schema import (
    EnvironmentSettings,
    S3EnvironmentSettings,
    SftpEnvironmentSettings,
)
from meca_engine.constants import (
    DEFAULT_CONFIG_DIR,
    ENV_VAR_AWS_REGION,
    ENV_VAR_CONFIG_DIR,
    ENV_VAR_DEBUG_LOGGING,
    ENV_VAR_ENVIRONMENT,
    ENV_VAR_S3_BUCKET_NAME,
    ENV_VAR_S3_INPUT_PREFIX,
    ENV_VAR_SFTP_DELETE_LOCAL,
    ENV_VAR_SFTP_HOST,
    ENV_VAR_SFTP_KEY_PATH,
    ENV_VAR_SFTP_PASSWORD,
    ENV_VAR_SFTP_PORT,
    ENV_VAR_SFTP_REMOTE_DIR,
    ENV_VAR_SFTP_USER,
    Environment,
)
from meca_engine.exceptions import ConfigurationError

if TYPE_CHECKING:
    from collections.abc import Mapping

_TRUE_VALUES = frozenset({"1", "true", "yes", "on"})


def _parse_bool(raw_value: str) -> bool:
    """Parse a truthy/falsy environment-variable string.

    Args:
        raw_value: The raw string value read from the environment.

    Returns:
        ``True`` if ``raw_value`` (case-insensitively) is one of
        ``{"1", "true", "yes", "on"}``; ``False`` otherwise.
    """
    return raw_value.strip().lower() in _TRUE_VALUES


def load_environment_settings(env: Mapping[str, str] | None = None) -> EnvironmentSettings:
    """Load environment-variable-sourced settings.

    Args:
        env: The environment mapping to read from. Defaults to
            ``os.environ`` when ``None`` — accepting an explicit mapping
            exists solely to make this function trivially unit-testable
            without mutating the real process environment.

    Returns:
        A fully-populated, immutable ``EnvironmentSettings`` instance.

    Raises:
        ConfigurationError: If ``MECA_ENGINE_ENVIRONMENT`` is set to a value
            that is not one of ``dev``, ``staging``, ``production``. This is
            a batch-level failure (12_LLD_03 §7.3): the engine must never
            start against an unrecognized environment.
    """
    source = env if env is not None else os.environ

    raw_environment = source.get(ENV_VAR_ENVIRONMENT, Environment.DEV.value)
    try:
        environment = Environment(raw_environment)
    except ValueError as exc:
        raise ConfigurationError(
            f"Invalid {ENV_VAR_ENVIRONMENT} value: {raw_environment!r}. "
            f"Must be one of: {', '.join(e.value for e in Environment)}.",
            stage="meca_engine.config.environment",
            inner_cause=exc,
        ) from exc

    config_dir = Path(source.get(ENV_VAR_CONFIG_DIR, DEFAULT_CONFIG_DIR))
    debug_logging_enabled = _parse_bool(source.get(ENV_VAR_DEBUG_LOGGING, "false"))

    # S3 environment settings (using AWS Default Credential Provider Chain)
    s3_settings = S3EnvironmentSettings(
        bucket_name=source.get(ENV_VAR_S3_BUCKET_NAME, source.get("MECA_S3_BUCKET_NAME", "")),
        prefix=source.get(ENV_VAR_S3_INPUT_PREFIX, source.get("MECA_S3_INPUT_PREFIX", "")),
        region=source.get(ENV_VAR_AWS_REGION, source.get("AWS_DEFAULT_REGION", "us-east-1")),
    )

    # SFTP environment settings
    sftp_port_raw = source.get(ENV_VAR_SFTP_PORT, source.get("MECA_SFTP_PORT", "22"))
    try:
        sftp_port = int(sftp_port_raw) if sftp_port_raw else 22
    except ValueError:
        sftp_port = 22

    sftp_settings = SftpEnvironmentSettings(
        host=source.get(ENV_VAR_SFTP_HOST, source.get("MECA_SFTP_HOST", "")),
        port=sftp_port,
        user=source.get(ENV_VAR_SFTP_USER, source.get("MECA_SFTP_USER", "")),
        password=source.get(ENV_VAR_SFTP_PASSWORD, source.get("MECA_SFTP_PASSWORD", "")),
        remote_dir=source.get(
            ENV_VAR_SFTP_REMOTE_DIR, source.get("MECA_SFTP_REMOTE_DIR", ".")
        ),
        key_path=source.get(ENV_VAR_SFTP_KEY_PATH, ""),
        delete_local_after_upload=_parse_bool(source.get(ENV_VAR_SFTP_DELETE_LOCAL, "false")),
    )

    return EnvironmentSettings(
        environment=environment,
        config_dir=config_dir,
        debug_logging_enabled=debug_logging_enabled,
        s3=s3_settings,
        sftp=sftp_settings,
    )

