# Version 1.0 Metadata (RC-1)

Single canonical source for this release's version identifiers. Every
one of these is either read directly from the file cited (never a
second, hand-maintained copy that could drift) or, where no such
constant exists in code today, stated here explicitly as the first time
it's been pinned.

| Component | Version | Source of truth |
|---|---|---|
| **MECA Engine** | `1.0.0-rc1` | `meca-engine/src/meca_engine/__init__.py` (`__version__`), `meca-engine/pyproject.toml` |
| **Release date** | 2026-09-30 | This document |
| **Dashboard (server)** | `1.0.0` | `dashboard/server/package.json` |
| **Dashboard (web)** | `1.0.0` | `dashboard/web/package.json` |
| **Business Rule Book** | 164 rules (BR-001–BR-164) | `01_BUSINESS_RULE_BOOK.md`; also exposed at runtime as `BUSINESS_RULE_BOOK_VERSION` in `meca-engine/src/meca_engine/reporting/reproducibility.py` |
| **Recovery Rule catalog** | 7 rules (RR-001–RR-007) | `meca-engine/src/meca_engine/model/recovery_rules.py`; also exposed at runtime as `RECOVERY_RULE_VERSION` in `reproducibility.py` |
| **DTD suite** | NISO MECA 1.0 + JATS Archiving 1.2 | `meca-engine/schemas/dtd/{meca-1.0,jats-archiving-1.2}/README.md` (vendored verbatim from the official NISO/NLM distribution points); also exposed at runtime as `DTD_VERSION` in `reproducibility.py` |
| **DTD Validation taxonomy** | 4 categories (`source_data_issue` / `business_rule_candidate` / `recovery_rule_candidate` / `validation_only`), 7 classification patterns as of this release | `meca-engine/src/meca_engine/validation/dtd_issue_classifier.py` |
| **Migration Audit report format** | Frozen as of the Migration Audit milestone this session; no independent version field exists — versioned together with the engine release | `meca-engine/src/meca_engine/reporting/migration_audit.py` |
| **Config schema suite** | 13 JSON Schema files, no independent per-file version field — versioned together with the engine release | `meca-engine/schemas/config-schema/*.schema.json` |

## What "frozen" means for RC-1

Business Rules, Recovery Rules, and DTD validation classification are
**frozen** as of this release — no rule content, recovery logic, or
classification pattern changed as part of this RC-1 milestone (it was
scoped to technical-debt/security/config/logging cleanup only). Every
package's own `migration-audit.json`/Migration Audit Report already
records the exact `engine_version`/`business_rule_book_version`/
`recovery_rule_version`/`dtd_version`/`config_checksum` it was built
with (`reporting/reproducibility.py`) — this file is the human-readable
index into those same values, not a separate, independently-maintained
set of numbers.

## Next tag

This repository, at the state this milestone leaves it in, is the
candidate for a `v1.0.0-rc1` tag (or `v1.0.0` directly, at the
maintainer's discretion — the RC label reflects that this hasn't yet
been exercised against real AWS/S3/SFTP infrastructure, not that
anything here is known-incomplete for the current LOCAL-provider scope).
