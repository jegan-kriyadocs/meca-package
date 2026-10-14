# Milestone 6A — Generator Framework Report

Builds the reusable infrastructure every future XML generator inherits.
No MECA XML generator, no XML mapping, no business-rule logic was
implemented. Extends (does not replace) 11_LLD_02_CANONICAL_MODEL_AND_CLASSES.md
§4.7's minimal `Generator[T]` interface with the lifecycle the current
task asked for.

---

## 1. Generator Framework Report

| Component | Module | Responsibility |
|---|---|---|
| **Base Generator** | `generators/base.py` — `BaseGenerator[T]` (ABC) | Lifecycle wrapper: logging (start/complete), timing, diagnostics snapshot, uniform error classification. Subclasses implement `_generate(context) -> T` and a `generator_name` property only. |
| **Generator Context** | `generators/context.py` — `GeneratorContext` | The one object carrying everything a generator may read: `model` (ICAM), `runtime_config`, `journal_config`, `publisher_config`, `feature_flags`, `logger`, `diagnostics`. Frozen — a generator cannot reassign any of these. |
| **Generation Result** | `generators/result.py` — `GenerationResult[T]` | The one object every `generate()` call returns: the output document, generator name, article id, duration, and a diagnostics snapshot. No "failed" flag — failure is always an exception. |
| **Diagnostics** | `generators/diagnostics.py` — `DiagnosticsCollector`, `GeneratorDiagnostic` | Per-run, mutable collector for info/warning/error observations that don't interrupt generation. The framework's one deliberately mutable object (never shared across articles). |
| **Validation Hooks** | `generators/validation_hooks.py` — `DtdValidationHook`, `SchemaValidationHook`, `BusinessRuleValidationHook` (all ABCs) | Extension points only — zero validation logic. A future `validation.engine.ValidationEngine` (11_LLD_02 §4.8) implements these. |
| **XML Document Builder** | `generators/xml/builder.py` — `XmlDocumentBuilder`, `DoctypeDeclaration`, `CData` | Tree construction + serialization: elements, attributes, comments, processing instructions, CDATA, XML declaration, DOCTYPE, pretty/compact modes. |
| **Namespace Manager** | `generators/xml/namespaces.py` — `NamespaceManager` | Config-driven prefix↔URI resolution and `xmlns` declaration building. No global namespace-registry mutation. |
| **XML Helper Library** | `generators/xml/helpers.py` | `add_optional_element`, `add_repeated_elements`, `append_mixed_text`, `preserve_whitespace`, `escape_text`, `format_year_month_day`, `strip_characters` — all business-rule-free. |
| **Exceptions** | `exceptions/article_errors.py` — `GeneratorError`, `GeneratorInvariantError`, `XmlSerializationError` | Integrated into the existing hierarchy under `ArticleLevelError`, matching `ArticleTransientError`'s grouping pattern. |
| **Config integration** | `config/schema.py`/`loader.py` — `NamespaceConfig`, `load_namespace_config()` | `config/namespaces.yaml`, schema-validated, no hard-coded URIs in code. |

---

## 2. XML Infrastructure Design

**Why not `xml.etree.ElementTree`'s own namespace machinery**: `ET.register_namespace()` mutates process-wide state — two generators (or two concurrently-generated articles) would corrupt each other's prefix choices. `XmlDocumentBuilder` never uses Clark-notation (`{uri}tag`) tags or `register_namespace()` at all; every tag/attribute name it writes is already the final literal string (e.g. `"xlink:href"`), decided by `NamespaceManager.declarations(...)` and handed in as plain attribute dict entries. This is what makes the builder safe for future parallel execution (item 12) without any lock or thread-local state.

**Serialization strategy**: `ET.tostring()` + `ET.indent()` (Python 3.9+) handle tree-walking, escaping, and whitespace-insertion — well-tested stdlib code, not reimplemented. On top of that, `XmlDocumentBuilder.serialize()` hand-builds the `<?xml ...?>` declaration and DOCTYPE line itself, since ElementTree's own declaration defaulting doesn't support "no encoding attribute at all" (`<?xml version="1.0"?>`, confirmed present in real `transfer.xml` output) or DOCTYPE emission. `serialize()` deep-clones the tree before indenting so calling it twice (once pretty, once compact) on the same `Element` never leaves cross-call whitespace contamination — the one deliberate "tree rebuild" in the framework, and a correctness requirement, not incidental cost.

**CDATA**: `xml.etree.ElementTree` has no native CDATA support. `CData(str)` is a marker subclass; `create_element` wraps its text with private sentinel delimiters before the tree is built, and `serialize()` regex-substitutes the (by-then-escaped) marked region back into a real `<![CDATA[...]]>` block, unescaping it first. Verified against real data: no genuine CDATA section exists in any of the 3 reference packages' output (`reviews.xml`'s one `"CDATA"` occurrence is a confirmed literal-string defect — a misreading of the DTD's own `review-type CDATA #REQUIRED` attribute-declaration syntax, not real CDATA usage) — this capability is provided per the task's explicit ask, not a current business need.

**Deterministic ordering**: not enforced by sorting — `dict` (Python 3.7+) and list iteration order are already insertion order, so attribute/element order is exactly the order a generator's code calls `create_element`/passes its `attributes` mapping. The builder never iterates a `set` or re-orders anything; determinism is a property of correct usage, documented in the module docstring.

**Helper utilities**: thin, generic wrappers only — `add_optional_element` (skip empty), `add_repeated_elements` (one tag per value), `append_mixed_text` (text/tail bookkeeping for mixed content), `preserve_whitespace` (`xml:space="preserve"`), `escape_text` (manual pre-escaping for the rare case of composing text outside the tree), `format_year_month_day` (a `date` → JATS's 3-element convention), `strip_characters` (a generic character-removal primitive a future DOI-builder could use — carries no opinion about *which* characters BR-058 strips).

---

## 3. Extension Architecture

- **Custom generators**: subclass `BaseGenerator[T]`, implement `generator_name` and `_generate(context) -> T`. `generate()` (inherited, never overridden) handles logging/timing/diagnostics/error-classification identically for every subclass — a future `RawXmlGenerator(BaseGenerator[RawXmlDocument])` gets all of this for free.
- **Publisher-specific overrides**: `GeneratorContext.publisher_config`/`.journal_config` already carry per-publisher/per-journal data into every generation call; a generator branches on these values internally — no framework change needed to add a new publisher.
- **Future journal plugins**: same mechanism — `JournalConfig` is loaded per journal by the existing `ConfigLoader`; nothing about the framework is journal-specific.
- **Validation**: `DtdValidationHook`/`SchemaValidationHook`/`BusinessRuleValidationHook` are ABCs a future `ValidationEngine` implements and registers — the framework's contract with validation is fixed now, so validation's own implementation milestone cannot force a framework change.
- **New namespaces**: add a key to `config/namespaces.yaml` (schema-validated) — no code change.

None of this required modifying `BaseGenerator`, `XmlDocumentBuilder`, or `NamespaceManager` to write — every extension point above is additive.

---

## 4. Testing Report

| Metric | Value |
|---|---|
| Total tests (unit + golden) | 619 passed, 0 failed |
| New tests this milestone | 91 (78 in `tests/unit/generators/` + 13 across `exceptions`/`config`/`logging_` for the supporting changes) |
| Coverage, every new/modified module | `generators/base.py` 100%, `context.py` 100%, `result.py` 100%, `diagnostics.py` 100%, `validation_hooks.py` 100%, `xml/builder.py` 100%, `xml/namespaces.py` 100%, `xml/helpers.py` 100%, `exceptions/*` 100%, `config/schema.py` 100%, `config/loader.py` 100%, `logging_/performance.py` 100% |
| Overall project coverage | 99% (2896 statements, 16 missed — all pre-existing, unmodified lines outside this milestone's scope) |
| `ruff check` | Clean (`src/`, `tests/`) |
| `ruff format --check` | Clean (213 files) |
| `mypy --strict` | Clean (207 source files) |

---

## 5. Architecture Compliance Report

- **Import direction, empirically verified**: `grep` over `src/meca_engine/generators/` shows every import is either from `meca_engine.exceptions`, `meca_engine.generators.*` (its own submodules), or `TYPE_CHECKING`-only references to `meca_engine.model`, `meca_engine.config`, `meca_engine.logging_`. **Zero** imports from `meca_engine.extraction` or `meca_engine.transform` anywhere in the package.
- **One-way dependency (ICAM → Framework → Generator)**: `GeneratorContext.model: ArticleModel` is the only ICAM access point; no generator-framework module reaches into `extraction.parsed_model`, a file path, or an S3 client.
- **ICAM read-only**: every ICAM type remains `@dataclass(frozen=True)` (unchanged this milestone); `GeneratorContext` itself is frozen, so a generator cannot even reassign `context.model` to a different object, let alone mutate the one it has.
- **No duplicated helper functions**: `XmlDocumentBuilder`/`NamespaceManager` are the *only* place any future generator constructs or serializes XML — verified by there being exactly one module that imports `xml.etree.ElementTree` for writing (`generators/xml/builder.py`; the read-side `extraction/xml_loader.py` uses `defusedxml`, a separate, pre-existing concern).
- **No business-rule logic introduced**: `grep`-searched every new module for BR-/ADR-specific vocabulary (DOI formulas, license text, article-type values, item-type values) — none found; `xml/helpers.py`'s `strip_characters` is explicitly generic (documented as carrying no opinion about which characters a future rule strips).
- **No XML mapping introduced**: no module reads `ArticleModel` fields and writes JATS/MECA-specific tags — `_generate` bodies don't exist yet (no concrete generator subclass was written).
- **Configuration-driven, no hard-coded values**: `NamespaceManager` takes its registry as a constructor argument; `config/namespaces.yaml` is the only place any namespace URI is written, schema-validated the same way as every other config file.

---

## 6. Readiness Assessment

**Ready for the first XML generator.** Every infrastructure piece the task asked for exists, is tested at 100%, and has zero forbidden dependencies. `BaseGenerator[T]`, `GeneratorContext`, `XmlDocumentBuilder`, `NamespaceManager`, and the XML helper library are the complete, stable surface a concrete generator needs.

**Recommend beginning `raw_xml` next** (Milestone 6B) — per 11_LLD_02 §4.7, it is the simplest generator (no configuration requirements, no DOI/license logic, "should not raise under normal conditions"), making it the correct first real consumer to validate the framework against actual JATS output shape before the more complex `article_xml`/`manifest_xml`/`reviews_xml`/`transfer_xml` generators build on top of it.

Not implemented in this milestone, by explicit instruction: `raw.xml`/`article.xml`/`manifest.xml`/`reviews.xml`/`transfer.xml` generation, the Validation Engine, and the Package Builder.

**Waiting for approval before starting Milestone 6B.**
