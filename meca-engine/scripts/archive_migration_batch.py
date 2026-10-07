#!/usr/bin/env python
"""Archive Migration batch runner — Processing Service (Archive Migration Platform).

Thin bootstrap only: load configuration, wire the Processing Service via
:func:`~meca_engine.service.service_factory.build_processing_service`, and
run it. Every orchestration concern (job creation, sequential dispatch,
progress tracking, operational retry, provider dispatch, reporting,
certification, intelligence) lives in `src/meca_engine/service/` and is
reused unchanged from here.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MECA_ENGINE_ROOT = Path(__file__).resolve().parents[1]

sys.path.insert(0, str(MECA_ENGINE_ROOT / "src"))

from meca_engine.config.loader import ConfigLoader  # noqa: E402
from meca_engine.service.service_factory import build_processing_service  # noqa: E402


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--batch-id",
        default=None,
        help="Nest this run's output/reports under batches/<batch-id>/ (Batch History). "
        "Omit for the original flat-path behavior.",
    )
    parser.add_argument(
        "--article-ids",
        default=None,
        help="Comma-separated article ids to process; omit to process everything the "
        "configured InputProvider reports.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of articles to process in this run (e.g. 50).",
    )
    parser.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Number of articles to skip from the beginning (e.g. 0, 50, 100).",
    )
    parser.add_argument(
        "--input-format",
        choices=["directory", "zip", "auto"],
        default="directory",
        help="Input format to process: 'directory' (default, uncompressed article folders), 'zip' (.zip archives), or 'auto' (both).",
    )
    return parser.parse_args()


def main() -> int:
    """Load configuration, build the Processing Service, and run it."""
    args = _parse_args()
    article_id_filter = (
        frozenset(a.strip() for a in args.article_ids.split(",") if a.strip())
        if args.article_ids
        else None
    )

    loader = ConfigLoader(
        config_dir=MECA_ENGINE_ROOT / "config",
        schema_dir=MECA_ENGINE_ROOT / "schemas" / "config-schema",
    )
    runtime_config = loader.load_runtime_config()

    service = build_processing_service(
        loader,
        runtime_config,
        repo_root=REPO_ROOT,
        batch_id=args.batch_id,
        article_id_filter=article_id_filter,
        limit=args.limit,
        offset=args.offset,
        input_format=args.input_format,
    )
    service.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
