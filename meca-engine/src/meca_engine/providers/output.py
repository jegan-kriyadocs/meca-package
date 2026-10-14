"""Output Provider — Archive Migration Platform Phase 1 (ADR-030).

Defines where the batch pipeline writes its generated packages.
Reproduces today's exact behavior (a local directory, one subfolder per
article) behind an interface a future SFTP-backed deployment can
implement without touching :class:`~meca_engine.packaging.builder.PackageBuilder`.

Deliberately never defaults to ``./Output`` — see
:class:`~meca_engine.config.schema.OutputSettings`'s docstring and the
Phase 1 Configuration Guide.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import TYPE_CHECKING

from meca_engine.exceptions import ProviderNotConfiguredError

if TYPE_CHECKING:
    from meca_engine.config.schema import OutputSettings

_STAGE = "meca_engine.providers.output"


class OutputProvider(ABC):
    """Where the batch writes its generated packages and per-article reports."""

    @abstractmethod
    def article_output_root(self, article_id: str) -> Path:
        """Return this article's output directory, creating it if needed."""

    @abstractmethod
    def category_root(self, category: str) -> Path:
        """Return a named output category's root directory, creating it if needed.

        Added for the Automated Migration Service (Phase 3, ADR-031):
        decision-routed destinations (``uploaded``, ``manual_review``,
        ``failed``) that are siblings of the per-article staging root
        :meth:`article_output_root` writes into, not subdirectories of it.

        Args:
            category: The category name (e.g. ``"uploaded"``).
        """


class LocalOutputProvider(OutputProvider):
    """Writes generated packages under a local directory, one subfolder per article."""

    def __init__(self, local_path: str) -> None:
        """Initialize the provider.

        Args:
            local_path: Root directory generated packages are written under.
        """
        self._root = Path(local_path)
        self._root.mkdir(parents=True, exist_ok=True)

    def article_output_root(self, article_id: str) -> Path:
        """Return (creating if needed) ``<local_path>/<article_id>/``."""
        path = self._root / article_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def category_root(self, category: str) -> Path:
        """Return (creating if needed) ``<local_path>/<category>/``."""
        path = self._root / category
        path.mkdir(parents=True, exist_ok=True)
        return path


class SftpOutputProvider(OutputProvider):
    """Outputs generated packages locally and uploads certified packages to an SFTP server.

    Staging and local categorisation are backed by :class:`LocalOutputProvider`
    so that local reports and files remain accessible, while certified packages
    are transferred to the remote SFTP destination.
    """

    def __init__(
        self,
        local_path: str = "",
        host: str | None = None,
        port: int | None = None,
        user: str | None = None,
        password: str | None = None,
        remote_dir: str | None = None,
        key_path: str | None = None,
        delete_local_on_success: bool = False,
    ) -> None:
        """Initialize the SFTP output provider.

        Args:
            local_path: Local directory to stage packages before upload.
            host: SFTP host. If omitted, read from SFTP_HOST env var.
            port: SFTP port (default 22). If omitted, read from SFTP_PORT.
            user: SFTP username. If omitted, read from SFTP_USER.
            password: SFTP password. If omitted, read from SFTP_PASSWORD.
            remote_dir: Target remote folder on the SFTP server (default '/sftp/meca').
            key_path: Optional path to SSH private key.
            delete_local_on_success: Whether to delete the local zip after successful upload.
        """
        self._local_path = local_path
        self._local_provider = LocalOutputProvider(local_path) if local_path else None

        self.host = host or os.environ.get("SFTP_HOST", os.environ.get("MECA_SFTP_HOST", ""))
        raw_port = port or os.environ.get("SFTP_PORT", os.environ.get("MECA_SFTP_PORT", "22"))
        try:
            self.port = int(raw_port) if raw_port else 22
        except ValueError:
            self.port = 22

        self.user = user or os.environ.get("SFTP_USER", os.environ.get("MECA_SFTP_USER", ""))
        self.password = (
            password or os.environ.get("SFTP_PASSWORD", os.environ.get("MECA_SFTP_PASSWORD", ""))
        )
        self.remote_dir = (
            remote_dir
            if remote_dir is not None
            else os.environ.get(
                "SFTP_REMOTE_DIR", os.environ.get("MECA_SFTP_REMOTE_DIR", "/sftp/meca")
            )
        )
        self.key_path = key_path or os.environ.get("SFTP_KEY_PATH", "")
        self.delete_local_on_success = delete_local_on_success or (
            os.environ.get("SFTP_DELETE_LOCAL_AFTER_UPLOAD", "false").lower()
            in {"1", "true", "yes", "on"}
        )
        self._ssh_client = None
        self._sftp_client = None

    def article_output_root(self, article_id: str) -> Path:
        """Return this article's local staging output directory."""
        if self._local_provider is None:
            raise ProviderNotConfiguredError(
                "SftpOutputProvider: local_path is not configured.",
                stage=_STAGE,
                article_id=article_id,
            )
        return self._local_provider.article_output_root(article_id)

    def category_root(self, category: str) -> Path:
        """Return a named output category's local directory."""
        if self._local_provider is None:
            raise ProviderNotConfiguredError(
                "SftpOutputProvider: local_path is not configured.",
                stage=_STAGE,
            )
        return self._local_provider.category_root(category)

    def _get_sftp(self):
        if self._sftp_client is not None:
            try:
                self._sftp_client.stat(".")
                return self._sftp_client
            except Exception:
                self.close()

        if not self.host or not self.user:
            raise ProviderNotConfiguredError(
                "SftpOutputProvider: SFTP_HOST and SFTP_USER environment variables must be set.",
                stage=_STAGE,
            )

        try:
            import paramiko
        except ImportError as exc:
            from meca_engine.exceptions import ConfigurationError

            raise ConfigurationError(
                "paramiko is required to use SftpOutputProvider but is not installed. "
                "Install it with: pip install paramiko",
                stage=_STAGE,
                inner_cause=exc,
            ) from exc

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        connect_kwargs = {
            "hostname": self.host,
            "port": self.port,
            "username": self.user,
            "timeout": 30,
        }
        if self.key_path and os.path.exists(self.key_path):
            connect_kwargs["key_filename"] = self.key_path
        elif self.password:
            connect_kwargs["password"] = self.password

        ssh.connect(**connect_kwargs)
        self._ssh_client = ssh
        self._sftp_client = ssh.open_sftp()
        return self._sftp_client

    def upload_package(self, article_id: str, local_article_dir: Path) -> str | None:
        """Upload this article's MECA package (.zip) to the SFTP server.

        Args:
            article_id: The article identifier.
            local_article_dir: Path to the article's category folder containing its zip.

        Returns:
            Remote path of the uploaded file on success, or None if no zip exists.
        """
        zips = list(local_article_dir.glob("*.zip"))
        if not zips:
            return None
        local_zip = zips[0]
        sftp = self._get_sftp()
        remote_target_dir = self.remote_dir.rstrip("/")
        if remote_target_dir and remote_target_dir != ".":
            _ensure_remote_sftp_dir(sftp, remote_target_dir)

        remote_final_path = f"{remote_target_dir}/{local_zip.name}" if remote_target_dir and remote_target_dir != "." else local_zip.name
        remote_tmp_path = f"{remote_target_dir}/.{local_zip.name}.tmp" if remote_target_dir and remote_target_dir != "." else f".{local_zip.name}.tmp"

        # Atomic upload: upload to hidden .tmp first, then rename
        sftp.put(str(local_zip), remote_tmp_path)
        try:
            sftp.posix_rename(remote_tmp_path, remote_final_path)
        except (AttributeError, IOError):
            try:
                sftp.remove(remote_final_path)
            except IOError:
                pass
            sftp.rename(remote_tmp_path, remote_final_path)

        if self.delete_local_on_success:
            local_zip.unlink(missing_ok=True)

        return remote_final_path

    def close(self) -> None:
        """Close active SFTP and SSH connections."""
        if self._sftp_client:
            try:
                self._sftp_client.close()
            except Exception:
                pass
            self._sftp_client = None
        if self._ssh_client:
            try:
                self._ssh_client.close()
            except Exception:
                pass
            self._ssh_client = None


def _ensure_remote_sftp_dir(sftp, remote_dir: str) -> None:
    """Ensure remote nested directories exist on the SFTP server."""
    parts = remote_dir.strip("/").split("/")
    current = "/" if remote_dir.startswith("/") else ""
    for part in parts:
        current = f"{current}/{part}" if current and current != "/" else f"/{part}"
        try:
            sftp.stat(current)
        except IOError:
            try:
                sftp.mkdir(current)
            except IOError:
                pass


def create_output_provider(settings: OutputSettings) -> OutputProvider:
    """Provider Factory: select an :class:`OutputProvider` from configuration.

    Raises:
        ProviderNotConfiguredError: If ``settings.provider`` names a
            provider this phase does not recognize at all (schema
            validation already rejects anything outside
            ``LOCAL``/``S3``/``SFTP``, so this is defense-in-depth).
    """
    if settings.provider == "LOCAL":
        return LocalOutputProvider(settings.local_path)
    if settings.provider == "SFTP":
        return SftpOutputProvider(local_path=settings.local_path)
    raise ProviderNotConfiguredError(
        f"Unknown output provider: {settings.provider!r}", stage=_STAGE
    )

