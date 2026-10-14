# Configuration Audit — Milestone 8

Every configuration file in the repository, cross-checked for
duplication, unused entries, hard-coded business values in code, and
hidden constants — system-wide, extending Milestone 6H's audit (which
covered only the generation layer) to config's own full surface plus
`packaging/`, `registry/`, `checkpoint/`, `orchestrator/`, `input/`.

## 1. Complete configuration inventory

| Config file | Schema file | Loaded by | Unused? |
|---|---|---|---|
| `runtime.yaml` | `runtime.schema.json` | `ConfigLoader.load_runtime_config` | No |
| `feature-flags.yaml` | `feature-flags.schema.json` | `ConfigLoader.load_feature_flags` | No |
| `media-types.yaml` | `media-types.schema.json` | `ConfigLoader.load_media_type_config` | No |
| `article-type-mapping.yaml` | `article-type-mapping.schema.json` | `ConfigLoader.load_article_type_mapping` | No |
| `item-type-mapping.yaml` | `item-type-mapping.schema.json` | `ConfigLoader.load_item_type_mapping` | No |
| `namespaces.yaml` | `namespaces.schema.json` | `ConfigLoader.load_namespace_config` | No |
| `raw-xml.yaml` | `raw-xml.schema.json` | `ConfigLoader.load_raw_xml_config` | No |
| `article-xml.yaml` | `article-xml.schema.json` | `ConfigLoader.load_article_xml_config` | No |
| `manifest-xml.yaml` | `manifest-xml.schema.json` | `ConfigLoader.load_manifest_xml_config` | No |
| `reviews-xml.yaml` | `reviews-xml.schema.json` | `ConfigLoader.load_reviews_xml_config` | No |
| `transfer-xml.yaml` | `transfer-xml.schema.json` | `ConfigLoader.load_transfer_xml_config` | No |
| `license-templates.yaml` | `license-templates.schema.json` | `ConfigLoader.load_license_templates` | No |
| `journals/*.yaml` (per-journal) | `journal.schema.json` | `ConfigLoader.load_journal_config` | No (only a README placeholder exists today — real per-journal files are created at deployment time, correctly not checked in) |
| `publishers/*.yaml` (per-publisher) | `publisher.schema.json` | `ConfigLoader.load_publisher_config` | No (same as above) |

**Every config file maps to exactly one loader method — no duplication,
no orphaned file, no file loaded twice by two different methods.**
Confirmed via `grep -c` cross-check (each filename string appears
exactly once across `loader.py`).

## 2. No duplicated mappings

`item-type-mapping.yaml` (physical-file category → MECA item-type) and
`article-type-mapping.yaml` (source `display-channel` → JATS
article-type) were diffed key-by-key — **zero overlapping keys**; they
map entirely different domains and were never at risk of drifting into
inconsistent duplicate definitions of the same concept.

`config/registry.py` (`ConfigRegistry`, an in-memory config *cache*) and
`registry/` (the DOI Registry *package*, Milestone 7) share a name
fragment but are unrelated, non-overlapping components — `ConfigRegistry`
caches loaded `JournalConfig`/`PublisherConfig` objects; `registry/`
validates DOI uniqueness. No shared state, no duplicated logic between
them.

## 3. No hard-coded business values (system-wide re-scan)

```
grep -rnE '"(Portland Press|Silverchair|Clinical Science|CLINSCI|10\.1042|CC-BY)"' src/meca_engine/ --include="*.py" | grep -v "docstring text describing ADR-007"
```
Re-run across the **entire** `src/meca_engine/` tree (not just
`generators/`, as in Milestone 6H) — zero new hits beyond the 2 already
known, already-classified docstring mentions. `packaging/`, `registry/`,
`checkpoint/`, `orchestrator/` introduce zero new business-value
literals.

## 4. Milestone 7's new configuration surface (re-verified)

`PackagingSettings` (zip compression, compression level, staging
subdirectory name, overwrite policy) is fully config-driven, added to
`runtime.yaml`/`runtime.schema.json` following the exact established
pattern. No literal zip-compression method or overwrite-policy string
appears in `packaging/*.py` outside default-parameter fallbacks that
config always overrides at the composition root.

## 5. Hidden constants — full-system scan

```
grep -rnE '"[A-Za-z]{3,}[- ][A-Za-z]{3,}"' src/meca_engine/packaging/*.py src/meca_engine/registry/*.py src/meca_engine/registry/backends/*.py src/meca_engine/checkpoint/*.py src/meca_engine/orchestrator/*.py
```
Every hit is either a structured-logging event name (`"asset copied"`,
`"validation summary"`, `"package skipped: already complete"`) or a
checkpoint stage's own enum string value (`"metadata-loaded"`,
`"published-operational"`, etc.) — both are structural/operational
identifiers, not business values, and match the same pattern already
accepted for every prior generator's own log messages.

## 6. Config file validation is mandatory and fails closed

Re-confirmed: `ConfigLoader._read_and_validate` raises
`ConfigurationError` (a `BatchLevelError`, halting the whole run) for
any file that fails JSON-Schema validation — `runtime.yaml`'s new
`packaging` section is validated exactly like every pre-existing
section (`additionalProperties: false`, explicit `required` list,
`enum` constraints on `zip_compression`/`overwrite_policy`).

## Verdict

No configuration defect found: zero duplication, zero unused files,
zero hard-coded business values in code, zero hidden constants, zero
duplicated mappings. Every configuration addition made across
Milestones 6-7 followed the exact established pattern without
introducing a new one.
