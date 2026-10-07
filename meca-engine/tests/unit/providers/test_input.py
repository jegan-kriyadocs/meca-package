"""Unit tests for meca_engine.providers.input."""

from __future__ import annotations

import tempfile
import zipfile
from pathlib import Path

import pytest

from meca_engine.config.schema import InputSettings
from meca_engine.exceptions import (
    InvalidArticlePackageError,
    ProviderNotConfiguredError,
    SourceUnavailableError,
)
from meca_engine.providers.input import (
    InputProvider,
    LocalInputProvider,
    S3InputProvider,
    StagedArticle,
    create_input_provider,
)

pytestmark = pytest.mark.unit


def _make_article_zip(root, article_id: str) -> None:
    zip_path = root / f"{article_id}.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr(f"{article_id}/{article_id}/{article_id}.xml", "<article/>")
        archive.writestr(f"{article_id}/{article_id}/Original/manuscript.docx", "content")


def test_local_input_provider_lists_zip_stems(tmp_path) -> None:
    _make_article_zip(tmp_path, "cs-2025-0001")
    _make_article_zip(tmp_path, "bcj-2025-0002")
    provider: InputProvider = LocalInputProvider(str(tmp_path))

    assert provider.list_articles() == ("bcj-2025-0002", "cs-2025-0001")


def test_local_input_provider_stages_article_and_finds_source_xml(tmp_path) -> None:
    _make_article_zip(tmp_path, "cs-2025-0001")
    provider = LocalInputProvider(str(tmp_path))

    staged = provider.stage_article("cs-2025-0001")

    assert isinstance(staged, StagedArticle)
    assert staged.article_id == "cs-2025-0001"
    assert staged.source_xml_path.name == "cs-2025-0001.xml"
    assert staged.staged_root == staged.source_xml_path.parent
    assert (staged.staged_root / "Original" / "manuscript.docx").is_file()
    assert staged.extraction_root is not None
    assert staged.extraction_root.is_dir()


def test_local_input_provider_rejects_a_zip_slip_member(tmp_path) -> None:
    """Regression (RC-1 security review): a member path that would extract outside the
    staging directory must be rejected, not silently extracted or skipped."""
    zip_path = tmp_path / "evil-article.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("evil-article/evil-article.xml", "<article/>")
        archive.writestr("../../../tmp/evil-article-escape.txt", "escaped")
    provider = LocalInputProvider(str(tmp_path))

    with pytest.raises(InvalidArticlePackageError) as exc_info:
        provider.stage_article("evil-article")
    assert exc_info.value.article_id == "evil-article"
    assert not (tmp_path / ".." / ".." / "tmp" / "evil-article-escape.txt").resolve().is_file()


def test_local_input_provider_removes_temp_dir_on_missing_source_xml(tmp_path) -> None:
    """Regression: a leaked temp extraction on a staging failure is a disk-space risk at scale."""
    zip_path = tmp_path / "no-xml-article.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("no-xml-article/Original/manuscript.docx", "content")
    provider = LocalInputProvider(str(tmp_path))

    with pytest.raises(InvalidArticlePackageError):
        provider.stage_article("no-xml-article")

    leaked = [p for p in Path(tempfile.gettempdir()).glob("am_no-xml-article_*")]
    assert leaked == []


def test_local_input_provider_raises_source_unavailable_for_missing_archive(tmp_path) -> None:
    """Regression: a missing archive is a source-data failure, not an engine failure."""
    provider = LocalInputProvider(str(tmp_path))

    with pytest.raises(SourceUnavailableError) as exc_info:
        provider.stage_article("does-not-exist")
    assert exc_info.value.article_id == "does-not-exist"


def test_local_input_provider_raises_source_unavailable_for_corrupt_zip(tmp_path) -> None:
    """Regression: a corrupt/unreadable ZIP is a source-data failure, not an engine failure."""
    zip_path = tmp_path / "bad-article.zip"
    zip_path.write_bytes(b"not a real zip file")
    provider = LocalInputProvider(str(tmp_path))

    with pytest.raises(SourceUnavailableError) as exc_info:
        provider.stage_article("bad-article")
    assert exc_info.value.article_id == "bad-article"


def test_local_input_provider_raises_invalid_package_for_empty_zip(tmp_path) -> None:
    """Regression (ebc-2025-3025): an empty archive is a source-data failure, not engine."""
    zip_path = tmp_path / "empty-article.zip"
    with zipfile.ZipFile(zip_path, "w"):
        pass
    provider = LocalInputProvider(str(tmp_path))

    with pytest.raises(InvalidArticlePackageError) as exc_info:
        provider.stage_article("empty-article")
    assert exc_info.value.article_id == "empty-article"


def test_s3_input_provider_raises_provider_not_configured() -> None:
    provider = S3InputProvider()

    with pytest.raises(ProviderNotConfiguredError):
        provider.list_articles()
    with pytest.raises(ProviderNotConfiguredError):
        provider.stage_article("cs-2025-0001")


def test_create_input_provider_selects_local(tmp_path) -> None:
    provider = create_input_provider(InputSettings(provider="LOCAL", local_path=str(tmp_path)))

    assert isinstance(provider, LocalInputProvider)


def test_create_input_provider_selects_s3() -> None:
    provider = create_input_provider(InputSettings(provider="S3", local_path="unused"))

    assert isinstance(provider, S3InputProvider)


def test_create_input_provider_rejects_unknown_provider() -> None:
    with pytest.raises(ProviderNotConfiguredError):
        create_input_provider(InputSettings(provider="FTP", local_path="unused"))


def test_s3_input_provider_list_articles(monkeypatch) -> None:
    provider = S3InputProvider(bucket="test-bucket", prefix="articles/")

    class FakePaginator:
        def paginate(self, **kwargs):
            return [
                {
                    "Contents": [
                        {"Key": "articles/CS20240001.zip"},
                        {"Key": "articles/CS20240002.zip"},
                        {"Key": "articles/__MACOSX/CS20240001.zip"},
                    ],
                    "CommonPrefixes": [
                        {"Prefix": "articles/CS20240003/"},
                    ],
                }
            ]

    class FakeClient:
        def get_paginator(self, operation_name):
            return FakePaginator()

    monkeypatch.setattr(provider, "_get_client", lambda: FakeClient())
    article_ids = provider.list_articles()

    assert article_ids == ("CS20240001", "CS20240002", "CS20240003")


def test_local_input_provider_modes(tmp_path) -> None:
    # Set up both a directory article and a zip article
    dir_article = tmp_path / "art-dir"
    dir_article.mkdir()
    (dir_article / "art-dir.xml").write_text("<article/>")

    _make_article_zip(tmp_path, "art-zip")

    # 1. Directory mode: only discovers the directory
    dir_provider = LocalInputProvider(str(tmp_path), input_format="directory")
    assert dir_provider.list_articles() == ("art-dir",)

    # 2. ZIP mode: only discovers the zip
    zip_provider = LocalInputProvider(str(tmp_path), input_format="zip")
    assert zip_provider.list_articles() == ("art-zip",)

    # 3. Auto mode: discovers both
    auto_provider = LocalInputProvider(str(tmp_path), input_format="auto")
    assert auto_provider.list_articles() == ("art-dir", "art-zip")


def test_local_input_provider_stages_from_directory_directly(tmp_path) -> None:
    article_dir = tmp_path / "direct-art"
    article_dir.mkdir()
    (article_dir / "direct-art.xml").write_text("<article id='direct'/>")
    (article_dir / "figure1.png").write_bytes(b"dummy image")

    provider = LocalInputProvider(str(tmp_path), input_format="directory")
    staged = provider.stage_article("direct-art")

    assert staged.article_id == "direct-art"
    assert staged.staged_root == article_dir
    assert staged.source_xml_path == article_dir / "direct-art.xml"
    assert staged.extraction_root is None  # Directly referenced without temp dir extraction overhead


