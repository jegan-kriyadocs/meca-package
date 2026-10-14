"""Decision-based output routing — Automated Migration Service (Phase 3, ADR-031).

Routes each article's finished artifacts to a named
:meth:`~meca_engine.providers.output.OutputProvider.category_root`
category based on its :class:`~meca_engine.packaging.conversion_report.ConversionReport`
status, per the fixed decision matrix:

- ``CERTIFIED`` / ``CERTIFIED_WITH_WARNINGS`` / ``CERTIFIED_WITH_RECOVERY``
  → ``uploaded`` (automatic).
- ``PARTIAL_CERTIFICATION`` → ``manual_review``.
- ``ENGINE_FAILURE`` / ``FATAL_FAILURE`` → ``failed``.

Never discards a package — every article lands in exactly one category.
Reuses the existing certification report writer and
``ConversionReport.to_dict()`` for every artifact; invents no new report
format.
"""

from __future__ import annotations

import json
import shutil
import sys
from typing import TYPE_CHECKING

from meca_engine.packaging.models import PackageStatus
from meca_engine.reporting.certification_report import write_certification_report

if TYPE_CHECKING:
    from pathlib import Path

    from meca_engine.packaging.conversion_report import ConversionReport
    from meca_engine.providers.output import OutputProvider

UPLOADED = "uploaded"
MANUAL_REVIEW = "manual_review"
FAILED = "failed"

_AUTO_UPLOAD_STATUSES = (
    PackageStatus.CERTIFIED,
    PackageStatus.CERTIFIED_WITH_WARNINGS,
    PackageStatus.CERTIFIED_WITH_RECOVERY,
)
_MANUAL_REVIEW_STATUSES = (PackageStatus.PARTIAL_CERTIFICATION,)


def decide_category(status: PackageStatus) -> str:
    """Map a report's status to its output category, per the fixed decision matrix."""
    if status in _AUTO_UPLOAD_STATUSES:
        return UPLOADED
    if status in _MANUAL_REVIEW_STATUSES:
        return MANUAL_REVIEW
    return FAILED


class OutputRouter:
    """Moves/writes one article's finished artifacts into its decided category."""

    def __init__(self, output_provider: OutputProvider) -> None:
        """Initialize the router against an already-configured OutputProvider."""
        self._output_provider = output_provider

    def route_built_package(
        self, article_id: str, staged_root: Path, report: ConversionReport
    ) -> Path:
        """Move an already-built package from its neutral staging root to its final category.

        Args:
            article_id: The article whose package this is.
            staged_root: The directory :class:`~meca_engine.packaging.builder.PackageBuilder`
                wrote into (``OutputProvider.article_output_root(article_id)``)
                — the MECA zip and its Certification Report already live here.
            report: The resulting report, whose status decides the
                destination category.

        Returns:
            The final directory the package now lives in.
        """
        category = decide_category(report.status)
        destination = self._output_provider.category_root(category) / article_id
        if destination.exists():
            shutil.rmtree(destination)
        shutil.move(str(staged_root), str(destination))

        if category == MANUAL_REVIEW:
            self._write_conversion_report_json(destination, report)
        elif category == UPLOADED and hasattr(self._output_provider, "upload_package"):
            try:
                remote_path = self._output_provider.upload_package(article_id, destination)
                print(
                    f"[INFO] [OutputRouter] Successfully transferred {article_id} to SFTP destination: {remote_path}",
                    file=sys.stderr,
                )
            except Exception as exc:
                print(
                    f"[ERROR] [OutputRouter] Failed to upload {article_id} package to SFTP: {exc}",
                    file=sys.stderr,
                )

        return destination

    def route_failed_article(self, report: ConversionReport) -> Path:
        """Write a failed article's Certification Report + conversion-report.json.

        No MECA package exists for a failure — per
        :class:`~meca_engine.packaging.models.PackageStatus`'s own
        contract, ``ENGINE_FAILURE``/``FATAL_FAILURE`` mean nothing was
        built, so there is nothing to move.
        """
        destination = self._output_provider.category_root(FAILED) / report.article_id
        destination.mkdir(parents=True, exist_ok=True)
        write_certification_report(
            report, destination / f"MECA_{report.article_id}_Certification_Report.html"
        )
        self._write_conversion_report_json(destination, report)
        return destination

    @staticmethod
    def _write_conversion_report_json(destination: Path, report: ConversionReport) -> None:
        (destination / "conversion-report.json").write_text(
            json.dumps(report.to_dict(), indent=2, default=str)
        )
