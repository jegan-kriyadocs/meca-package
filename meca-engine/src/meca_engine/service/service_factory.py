"""Service Factory — wires the Processing Service's dependencies from RuntimeConfig.

Every construction here is exactly what `scripts/archive_migration_batch.py`
built inline before this refactor — unchanged generators, unchanged
:class:`~meca_engine.packaging.builder.PackageBuilder`, unchanged providers.
The only new object is the shared, construct-once
:class:`~meca_engine.checkpoint.store.CheckpointStore` backing the
:class:`~meca_engine.packaging.batch_runner.PackageBatchRunner`.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import TYPE_CHECKING

from meca_engine.checkpoint.backends.in_memory import InMemoryCheckpointStore
from meca_engine.config.schema import PublisherConfig
from meca_engine.generators.article_xml.generator import ArticleXmlGenerator
from meca_engine.generators.manifest_xml.generator import ManifestXmlGenerator
from meca_engine.generators.raw_xml.xslt_generator import XsltRawXmlGenerator
from meca_engine.generators.reviews_xml.generator import ReviewsXmlGenerator
from meca_engine.generators.transfer_xml.generator import TransferXmlGenerator
from meca_engine.generators.xml.namespaces import NamespaceManager
from meca_engine.logging_ import get_logger
from meca_engine.packaging.asset_copy import AssetCopyService
from meca_engine.packaging.batch_runner import PackageBatchRunner
from meca_engine.packaging.builder import PackageBuilder
from meca_engine.packaging.zip_builder import ZipBuilder
from meca_engine.providers.input import create_input_provider
from meca_engine.providers.output import create_output_provider
from meca_engine.registry.backends.in_memory import InMemoryDoiRegistry
from meca_engine.service.processing_service import ProcessingService
from meca_engine.service.router import OutputRouter
from meca_engine.service.worker import Worker

if TYPE_CHECKING:
    from meca_engine.config.loader import ConfigLoader
    from meca_engine.config.schema import RuntimeConfig

_PORTLAND_PRESS_PUBLISHER = {
    "publisher_id": "portland-press",
    "provider_name": "Portland Press Limited",
    "destination_provider_name": "Silverchair",
    "default_contact_policy": "corresponding_author_email",
}


def _resolve_path(base: Path, value: str) -> Path:
    """Resolve a config-supplied path against the repo root, unless already absolute."""
    path = Path(value)
    return path if path.is_absolute() else base / path


def build_processing_service(
    loader: ConfigLoader,
    runtime_config: RuntimeConfig,
    *,
    repo_root: Path,
    batch_id: str | None = None,
    article_id_filter: frozenset[str] | None = None,
    limit: int | None = None,
    offset: int = 0,
    input_format: str = "directory",
) -> ProcessingService:
    """Wire every dependency and return a ready-to-run :class:`ProcessingService`.

    Args:
        loader: Already-constructed :class:`~meca_engine.config.loader.ConfigLoader`.
        runtime_config: Already-loaded runtime configuration.
        repo_root: The repository root relative-config-paths resolve against.
        batch_id: If given, this run's output and reports are nested under
            ``<dashboard.reports_path>/batches/<batch_id>/`` (Batch History),
            and control/live-status files are written there too. ``None``
            (the default) preserves the exact flat-path behavior every
            direct CLI invocation has always had.
        article_id_filter: If given, only these article ids are processed
            (e.g. "restart failed/manual-review articles only").
        limit: Maximum number of articles to process.
        offset: Number of articles to skip from start.
        input_format: Format filter - "directory" (default), "zip", or "auto".
    """
    input_settings = replace(
        runtime_config.input,
        local_path=str(_resolve_path(repo_root, runtime_config.input.local_path)),
    )
    reports_base = _resolve_path(repo_root, runtime_config.dashboard.reports_path)

    control_path: Path | None = None
    status_path: Path | None = None
    if batch_id is not None:
        batch_root = reports_base / "batches" / batch_id
        output_local_path = batch_root / "generated_packages"
        reports_dir = batch_root / "reports"
        control_path = batch_root / "control.json"
        status_path = batch_root / "live_status.json"
    else:
        output_local_path = _resolve_path(repo_root, runtime_config.output.local_path)
        reports_dir = reports_base

    output_settings = replace(runtime_config.output, local_path=str(output_local_path))

    input_provider = create_input_provider(input_settings, input_format=input_format)
    output_provider = create_output_provider(output_settings)

    namespace_manager = NamespaceManager(loader.load_namespace_config().namespaces)
    media_type_config = loader.load_media_type_config()
    feature_flags = loader.load_feature_flags()

    raw_gen = XsltRawXmlGenerator()
    article_gen = ArticleXmlGenerator(
        namespace_manager=namespace_manager,
        article_xml_config=loader.load_article_xml_config(),
        article_type_mapping=loader.load_article_type_mapping(),
        license_templates=loader.load_license_templates(),
        publisher_abbreviation_mapping=loader.load_publisher_abbreviation_mapping(),
        raw_xml_generator=raw_gen,  # type: ignore[arg-type]
    )
    manifest_gen = ManifestXmlGenerator(
        namespace_manager=namespace_manager,
        manifest_xml_config=loader.load_manifest_xml_config(),
        item_type_mapping=loader.load_item_type_mapping(),
        media_type_config=media_type_config,
    )
    reviews_gen = ReviewsXmlGenerator(
        namespace_manager=namespace_manager, reviews_xml_config=loader.load_reviews_xml_config()
    )
    transfer_gen = TransferXmlGenerator(
        namespace_manager=namespace_manager, transfer_xml_config=loader.load_transfer_xml_config()
    )

    publisher_config = PublisherConfig(**_PORTLAND_PRESS_PUBLISHER)
    shared_doi_registry = InMemoryDoiRegistry()

    package_builder = PackageBuilder(
        raw_generator=raw_gen,  # type: ignore[arg-type]
        article_generator=article_gen,
        manifest_generator=manifest_gen,
        reviews_generator=reviews_gen,
        transfer_generator=transfer_gen,
        namespace_manager=namespace_manager,
        asset_copy_service=AssetCopyService(
            overwrite_policy="fail", logger=get_logger("service.assets")
        ),
        zip_builder=ZipBuilder(
            compression="deflated", compresslevel=6, logger=get_logger("service.zip")
        ),
        logger=get_logger("service.builder"),
        doi_registry=shared_doi_registry,
    )

    checkpoint_store = InMemoryCheckpointStore()
    package_batch_runner = PackageBatchRunner(
        package_builder=package_builder,
        checkpoint_store=checkpoint_store,
        logger=get_logger("service.batch_runner"),
    )

    output_router = OutputRouter(output_provider)

    worker = Worker(
        input_provider=input_provider,
        output_provider=output_provider,
        output_router=output_router,
        package_batch_runner=package_batch_runner,
        runtime_config=runtime_config,
        media_type_config=media_type_config,
        feature_flags=feature_flags,
        publisher_config=publisher_config,
        retry_settings=runtime_config.retry,
    )

    return ProcessingService(
        input_provider=input_provider,
        worker=worker,
        reports_dir=reports_dir,
        article_id_filter=article_id_filter,
        control_path=control_path,
        status_path=status_path,
        limit=limit,
        offset=offset,
    )
