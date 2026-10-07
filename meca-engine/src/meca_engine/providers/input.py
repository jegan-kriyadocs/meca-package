"""Input Provider — Archive Migration Platform Phase 1 (ADR-030).

Defines where the batch pipeline reads its articles from. Reproduces
today's exact behavior (a local directory of ``<ArticleID>.zip``
archives) behind an interface a future S3-backed deployment can
implement without touching anything downstream of :class:`StagedArticle`.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import zipfile
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from meca_engine.exceptions import (
    InvalidArticlePackageError,
    ProviderNotConfiguredError,
    SourceUnavailableError,
)

if TYPE_CHECKING:
    from meca_engine.config.schema import InputSettings

_STAGE = "meca_engine.providers.input"


@dataclass(frozen=True)
class StagedArticle:
    """One article, extracted and ready for the existing pipeline to read.

    Attributes:
        article_id: The article's identifier (its archive's filename, minus ``.zip``).
        staged_root: The local directory containing the article's round
            folders — exactly what :mod:`meca_engine.extraction.file_resolver`
            already expects as ``staged_root``.
        source_xml_path: The discovered root source XML file.
        extraction_root: The temporary directory this article was
            extracted into, if any (``None`` for a provider that stages
            from an already-persistent location). Distinct from
            ``staged_root`` — which may be a nested subdirectory of
            it — so a caller can remove the *entire* extraction, not
            just the part :mod:`~meca_engine.extraction.file_resolver`
            reads from. The caller (:class:`~meca_engine.service.worker.Worker`)
            removes this once the article is fully processed, matching
            13_LLD_04_PIPELINE_SCALABILITY_VALIDATION.md §9.4's existing
            "working directory deleted after success or terminal
            failure" lifecycle.
    """

    article_id: str
    staged_root: Path
    source_xml_path: Path
    extraction_root: Path | None = None


class InputProvider(ABC):
    """Where the batch reads its articles from."""

    @abstractmethod
    def list_articles(self) -> tuple[str, ...]:
        """List every article id available to process, in a stable order."""

    @abstractmethod
    def stage_article(self, article_id: str) -> StagedArticle:
        """Make one article's content available on local disk for the existing pipeline."""


class LocalInputProvider(InputProvider):
    """Reads articles from a local directory, supporting both raw article folders and .zip archives.

    Extraction happens here (not in a shared reader) specifically so the
    rest of the pipeline — everything from :class:`~meca_engine.extraction.xml_loader.XmlLoader`
    onward — behaves exactly as it does today. For uncompressed folders, files are used
    directly in place without temporary extraction overhead.
    """

    def __init__(self, local_path: str, input_format: str = "auto") -> None:
        """Initialize the provider.

        Args:
            local_path: Directory containing article folders and/or ``<ArticleID>.zip`` archives.
            input_format: Format filter - ``"directory"``, ``"zip"``, or ``"auto"`` (default).
        """
        self._root = Path(local_path)
        self.input_format = (input_format or "auto").lower()

    def list_articles(self) -> tuple[str, ...]:
        """List all article IDs under ``local_path``, respecting the configured input_format."""
        if not self._root.is_dir():
            return ()
        article_ids: set[str] = set()
        # 1. Discover directories if format is "directory" or "auto"
        if self.input_format in ("directory", "auto"):
            for p in self._root.iterdir():
                if p.is_dir() and not p.name.startswith(".") and p.name != "__MACOSX":
                    article_ids.add(p.name)
        # 2. Discover .zip archives if format is "zip" or "auto"
        if self.input_format in ("zip", "auto"):
            for p in self._root.glob("*.zip"):
                if not p.name.startswith(".") and "__MACOSX" not in p.name:
                    article_ids.add(p.stem)
        return tuple(sorted(article_ids))

    def stage_article(self, article_id: str) -> StagedArticle:
        """Stage an article from either a local directory or a .zip archive based on input_format.

        Raises:
            SourceUnavailableError: Neither directory nor readable archive exists matching input_format.
            InvalidArticlePackageError: Source directory or archive contains no source XML,
                or archive contains a path traversal member ("zip slip").
        """
        dir_path = self._root / article_id
        zip_path = self._root / f"{article_id}.zip"

        # Case 1: Directory exists (if allowed by format)
        if self.input_format in ("directory", "auto") and dir_path.is_dir():
            source_xml_path = _find_source_xml(dir_path, article_id)
            return StagedArticle(
                article_id=article_id,
                staged_root=source_xml_path.parent,
                source_xml_path=source_xml_path,
                extraction_root=None,
            )

        # Case 2: Zip archive exists (if allowed by format)
        if self.input_format in ("zip", "auto") and zip_path.is_file():
            tmp_path = Path(tempfile.mkdtemp(prefix=f"am_{article_id}_"))
            try:
                try:
                    with zipfile.ZipFile(zip_path) as archive:
                        names = [n for n in archive.namelist() if "__MACOSX" not in n]
                        _reject_unsafe_members(names, tmp_path, article_id)
                        archive.extractall(tmp_path, members=names)
                except zipfile.BadZipFile as exc:
                    raise SourceUnavailableError(
                        f"Source archive for {article_id!r} is corrupt or not a valid ZIP: {exc}",
                        article_id=article_id,
                        stage=_STAGE,
                        inner_cause=exc,
                    ) from exc
                source_xml_path = _find_source_xml(tmp_path, article_id)
            except BaseException:
                shutil.rmtree(tmp_path, ignore_errors=True)
                raise
            return StagedArticle(
                article_id=article_id,
                staged_root=source_xml_path.parent,
                source_xml_path=source_xml_path,
                extraction_root=tmp_path,
            )

        # Case 3: Neither exists
        raise SourceUnavailableError(
            f"Source for {article_id!r} not found in {self._root} for input_format={self.input_format!r}",
            article_id=article_id,
            stage=_STAGE,
        )


def _reject_unsafe_members(names: list[str], destination_root: Path, article_id: str) -> None:
    """Reject a ZIP outright if any member would extract outside ``destination_root``.

    RC-1 security review: :meth:`zipfile.ZipFile.extractall` does not
    protect against "zip slip" — a member name such as
    ``"../../../etc/cron.d/evil"`` or an absolute path is not sanitized by
    the stdlib and could otherwise write outside the intended staging
    directory. Checked once, before extraction, against every member
    name; a single unsafe member fails the whole archive rather than
    silently skipping just that one entry, since a crafted path is a sign
    the archive itself should not be trusted.
    """
    destination_root = destination_root.resolve()
    for name in names:
        resolved = (destination_root / name).resolve()
        if resolved != destination_root and destination_root not in resolved.parents:
            raise InvalidArticlePackageError(
                f"Source archive for {article_id!r} contains an unsafe member "
                f"path outside the staging directory: {name!r}",
                article_id=article_id,
                stage=_STAGE,
            )


class S3InputProvider(InputProvider):
    """Downloads and stages articles from Amazon S3 using AWS SDK default credentials.

    Follows the AWS Default Credential Provider Chain (IAM Role, AWS SSO, ~/.aws/credentials)
    without requiring static AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY.
    """

    def __init__(
        self,
        bucket: str | None = None,
        prefix: str | None = None,
        region: str | None = None,
        input_format: str = "auto",
    ) -> None:
        """Initialize the S3 input provider.

        Args:
            bucket: S3 bucket name. If omitted, read from S3_BUCKET_NAME env var.
            prefix: Key prefix within the bucket. If omitted, read from S3_INPUT_PREFIX.
            region: AWS region. If omitted, read from AWS_REGION or defaults to us-east-1.
            input_format: Format filter - ``"directory"``, ``"zip"``, or ``"auto"`` (default).
        """
        self.bucket = (
            bucket
            or os.environ.get("S3_BUCKET_NAME")
            or os.environ.get("MECA_S3_BUCKET_NAME")
            or ""
        )
        self.prefix = (
            prefix
            if prefix is not None
            else os.environ.get("S3_INPUT_PREFIX", os.environ.get("MECA_S3_INPUT_PREFIX", ""))
        ).strip("/")
        self.region = (
            region
            or os.environ.get("AWS_REGION")
            or os.environ.get("AWS_DEFAULT_REGION")
            or "us-east-1"
        )
        self.input_format = (input_format or "directory").lower()
        self._client = None

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import boto3
        except ImportError as exc:
            from meca_engine.exceptions import ConfigurationError

            raise ConfigurationError(
                "boto3 is required to use S3InputProvider but is not installed. "
                'Install it with: pip install -e ".[aws]" (or pip install boto3)',
                stage=_STAGE,
                inner_cause=exc,
            ) from exc

        client_kwargs = {}
        if self.region:
            client_kwargs["region_name"] = self.region
        self._client = boto3.client("s3", **client_kwargs)
        return self._client

    def list_articles(self) -> tuple[str, ...]:
        """List all article IDs available in the configured S3 bucket matching input_format."""
        if not self.bucket:
            raise ProviderNotConfiguredError(
                "S3InputProvider is not configured: S3_BUCKET_NAME environment variable is not set.",
                stage=_STAGE,
            )
        client = self._get_client()
        paginator = client.get_paginator("list_objects_v2")
        article_ids: set[str] = set()

        prefix_with_slash = f"{self.prefix}/" if self.prefix else ""

        try:
            for page in paginator.paginate(
                Bucket=self.bucket, Prefix=prefix_with_slash, Delimiter="/"
            ):
                if self.input_format in ("zip", "auto"):
                    for obj in page.get("Contents", []):
                        key = obj["Key"]
                        if key.endswith(".zip"):
                            name = key[len(prefix_with_slash) :]
                            stem = Path(name).stem
                            if stem and "__MACOSX" not in key:
                                article_ids.add(stem)
                if self.input_format in ("directory", "auto"):
                    for cp in page.get("CommonPrefixes", []):
                        p = cp["Prefix"]
                        name = p[len(prefix_with_slash) :].rstrip("/")
                        if name:
                            article_ids.add(name)
        except Exception as exc:
            raise SourceUnavailableError(
                f"Failed to list articles from S3 bucket {self.bucket!r} (prefix={self.prefix!r}): {exc}",
                stage=_STAGE,
                inner_cause=exc,
            ) from exc

        return tuple(sorted(article_ids))

    def stage_article(self, article_id: str) -> StagedArticle:
        """Download and unpack one article from S3 to a temporary staging folder."""
        if not self.bucket:
            raise ProviderNotConfiguredError(
                "S3InputProvider is not configured: S3_BUCKET_NAME environment variable is not set.",
                stage=_STAGE,
                article_id=article_id,
            )
        client = self._get_client()
        tmp_path = Path(tempfile.mkdtemp(prefix=f"am_{article_id}_"))
        prefix_with_slash = f"{self.prefix}/" if self.prefix else ""
        zip_key = f"{prefix_with_slash}{article_id}.zip"
        local_zip = tmp_path / f"{article_id}.zip"

        try:
            downloaded_zip = False
            if self.input_format in ("zip", "auto"):
                try:
                    client.download_file(self.bucket, zip_key, str(local_zip))
                    downloaded_zip = True
                except Exception:
                    downloaded_zip = False

            if downloaded_zip:
                with zipfile.ZipFile(local_zip) as archive:
                    names = [n for n in archive.namelist() if "__MACOSX" not in n]
                    _reject_unsafe_members(names, tmp_path, article_id)
                    archive.extractall(tmp_path, members=names)
                source_xml_path = _find_source_xml(tmp_path, article_id)
            elif self.input_format in ("directory", "auto"):
                folder_prefix = f"{prefix_with_slash}{article_id}/"
                paginator = client.get_paginator("list_objects_v2")
                downloaded_any = False
                for page in paginator.paginate(Bucket=self.bucket, Prefix=folder_prefix):
                    for obj in page.get("Contents", []):
                        key = obj["Key"]
                        rel_path = key[len(folder_prefix) :]
                        if not rel_path or rel_path.endswith("/"):
                            continue
                        dest_file = tmp_path / rel_path
                        dest_file.parent.mkdir(parents=True, exist_ok=True)
                        client.download_file(self.bucket, key, str(dest_file))
                        downloaded_any = True

                if not downloaded_any:
                    raise SourceUnavailableError(
                        f"Source for {article_id!r} not found in S3 bucket {self.bucket!r} (checked {zip_key!r} and {folder_prefix!r})",
                        article_id=article_id,
                        stage=_STAGE,
                    )
                source_xml_path = _find_source_xml(tmp_path, article_id)
            else:
                raise SourceUnavailableError(
                    f"Source for {article_id!r} not found in S3 bucket {self.bucket!r} for format {self.input_format!r}",
                    article_id=article_id,
                    stage=_STAGE,
                )

        except BaseException:
            shutil.rmtree(tmp_path, ignore_errors=True)
            raise

        return StagedArticle(
            article_id=article_id,
            staged_root=source_xml_path.parent,
            source_xml_path=source_xml_path,
            extraction_root=tmp_path,
        )


def create_input_provider(settings: InputSettings, input_format: str = "auto") -> InputProvider:
    """Provider Factory: select an :class:`InputProvider` from configuration.

    Raises:
        ProviderNotConfiguredError: If ``settings.provider`` names a
            provider this phase does not recognize at all.
    """
    if settings.provider == "LOCAL":
        return LocalInputProvider(settings.local_path, input_format=input_format)
    if settings.provider == "S3":
        return S3InputProvider(input_format=input_format)
    raise ProviderNotConfiguredError(f"Unknown input provider: {settings.provider!r}", stage=_STAGE)


def _find_source_xml(extracted_root: Path, article_id: str) -> Path:
    candidates = [
        p
        for p in extracted_root.rglob("*.xml")
        if "__MACOSX" not in p.parts and not p.name.startswith("._")
    ]
    if not candidates:
        raise InvalidArticlePackageError(
            f"No source XML found for {article_id!r} under {extracted_root}",
            article_id=article_id,
            stage=_STAGE,
        )
    if len(candidates) == 1:
        return candidates[0]
    for p in candidates:
        if p.stem.lower() == article_id.lower():
            return p
    return candidates[0]
