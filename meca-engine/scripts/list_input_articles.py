#!/usr/bin/env python
"""List available articles from the configured InputProvider (Local or S3).

Emits a JSON object on stdout containing:
  - provider: "LOCAL" | "S3"
  - path: The configured path or bucket/prefix
  - total: Total count of discovered articles
  - articles: List of article IDs
  - error: Error message if discovery failed, otherwise null
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

MECA_ENGINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = MECA_ENGINE_ROOT.parent
sys.path.insert(0, str(MECA_ENGINE_ROOT / "src"))

from meca_engine.config.loader import ConfigLoader  # noqa: E402
from meca_engine.providers.input import create_input_provider  # noqa: E402
from meca_engine.service.service_factory import _resolve_path  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-format",
        choices=["directory", "zip", "auto"],
        default="directory",
        help="Input format to filter articles by: 'directory' (default), 'zip', or 'auto'.",
    )
    args = parser.parse_args()

    try:
        loader = ConfigLoader(
            config_dir=MECA_ENGINE_ROOT / "config",
            schema_dir=MECA_ENGINE_ROOT / "schemas" / "config-schema",
        )
        runtime_config = loader.load_runtime_config()

        input_settings = replace(
            runtime_config.input,
            local_path=str(_resolve_path(REPO_ROOT, runtime_config.input.local_path)),
        )

        provider = create_input_provider(input_settings, input_format=args.input_format)
        articles = provider.list_articles()

        display_path = (
            input_settings.local_path
            if input_settings.provider == "LOCAL"
            else f"s3://{getattr(provider, 'bucket', '')}/{getattr(provider, 'prefix', '')}"
        )

        print(
            json.dumps(
                {
                    "provider": input_settings.provider,
                    "path": display_path,
                    "total": len(articles),
                    "articles": list(articles),
                    "error": None,
                }
            )
        )
        return 0
    except Exception as exc:  # noqa: BLE001
        print(
            json.dumps(
                {
                    "provider": getattr(locals().get("input_settings"), "provider", "UNKNOWN"),
                    "path": "",
                    "total": 0,
                    "articles": [],
                    "error": str(exc),
                }
            )
        )
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
