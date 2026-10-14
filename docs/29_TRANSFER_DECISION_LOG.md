# Transfer Decision Log — transfer.xml Generator (Milestone 6G)

Authoritative reference for every implementation decision this
milestone made. transfer.xml is the most mechanically-derivable of the
5 generators (13 of BR-126–140's 15 rules are "Confirmed" in the
Business Rule Book), so most decisions here are direct, low-ambiguity
config-wiring choices — the few genuine judgment calls are called out
explicitly, alongside the assumptions this milestone deliberately
rejected.

## Configuration mapping

| Decision | Reason | Evidence |
|---|---|---|
| `PublisherConfig.provider_name`/`.destination_provider_name` (already-existing fields, cited to BR-128/BR-134 in their own docstrings) are read directly — no new publisher config surface added | These fields were already provisioned, before this milestone began, specifically for transfer.xml's use | `PublisherConfig`'s own docstring names BR-128/BR-134 explicitly |
| `JournalConfig.acronym` (already-existing field, cited to ADR-007 in its own docstring) is read directly for both `transfer-source` and `destination` publication blocks — no new journal config surface added | Same reasoning — pre-provisioned, ADR-007-cited | `JournalConfig`'s own docstring names ADR-007 explicitly |
| `TransferXmlConfig` is a new, dedicated config object holding every value this milestone's instructions explicitly forbid hard-coding: DOCTYPE strings, `transfer-version`, `publication/@type`, the `authentication-code` separator, the 2 processing-instruction step texts, the `processing-comments` template, both sibling filename patterns, and all 3 section-header comment texts | Explicit instruction: "Do not hard-code: publisher names, journal names, Silverchair values, Portland Press values, transfer identifiers, organization names, namespaces, version numbers" — even values with no per-journal/publisher variance (e.g. `"journal"` as `publication/@type`, or `"1.0"` as `transfer-version`) are config, not literals, matching the same discipline every prior generator applied to its own "always this value" constants (e.g. reviews.xml's `blinding="single"`) | `grep` confirms zero business-value string literals in `generator.py` |
| The `meca-transfer` namespace URI is read from the already-existing `namespaces.yaml` registry (pre-provisioned in Milestone 6A, alongside `meca-manifest`/`meca-reviews`) | No new namespace registry entry was needed | `config/namespaces.yaml` already had `meca-transfer: https://manuscriptexchange.org/schema/transfer` before this milestone began |

## Identifier mapping

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| `authentication-code` = `f"{publisher_id_value}{separator}{publisher_id_value}"` (the same value repeated, joined by a configured separator) | BR-136 | Matches all 3 real samples exactly, including `cs-2025-8827`'s unusual lower-case-with-dashes literal `publisher_id_value` — no normalization applied, byte-verbatim | 3/3 exact match: `"CS20256808\|CS20256808"`, `"CS20258493\|CS20258493"`, `"cs-2025-8827\|cs-2025-8827"` |
| Uses `ArticleIdentity.publisher_id_value` specifically, never `doi_article_id_value` | BR-136 | The Business Rule Book's own text notes this "resolves what earlier analysis flagged as an inconsistency" — publisher-id, not DOI-id, is confirmed correct across all 3 samples | BR-136's own text |
| An empty `publisher_id_value` still produces `authentication-code` with the configured separator alone (e.g. `"\|"`), never a fabricated placeholder identifier | (Never-fabricate principle) | Diagnosed (`WARNING`, "incomplete identifiers") rather than silently defaulted to a synthetic value | `test_missing_publisher_id_is_diagnosed_incomplete_identifiers` |

## Namespace decisions

| Decision | Reason | Evidence |
|---|---|---|
| Only the default (`xmlns`) namespace is declared — no `xlink`, no `ali` | transfer.xml never references a file (no `ext-link`, no attached resource) and never embeds a license statement — direct inspection of all 3 real samples confirms neither `xlink:` nor `ali:` prefix is ever used | 3/3: `grep` over each real transfer.xml finds zero occurrences of either prefix |
| An unregistered `meca-transfer` namespace raises `GeneratorInvariantError` (not diagnosed) | Same treatment as every prior generator's required-namespace check (manifest.xml, reviews.xml) — a missing namespace registration is a configuration-setup defect, not a data-quality gap, so it must stop generation rather than silently produce an invalid document | `test_unregistered_namespace_raises_generator_invariant_error` |

## Transfer metadata

| Decision | Rule | Reason | Evidence |
|---|---|---|---|
| `transfer-source/publication/publication-title` and `destination/publication/publication-title` both read the same `JournalMeta.journal_title` value — no separate "destination title" field exists or is needed | BR-132/135 | The destination is the *same journal*, being transferred to a different system — there is no second, independently-sourced title in any real sample | 3/3: both blocks are byte-identical in every real sample |
| Contact-name fields (`<surname/>`, `<given-names/>`) and phone (`<phone/>`) are always created, always empty — never omitted | BR-129/131 | These elements are *present* (self-closing) in every real sample, not *absent* — a different structural fact from "optional field, sometimes omitted" (handled by `add_optional_element` elsewhere), so this milestone deliberately does **not** reuse that helper for these 3 fields | Direct byte inspection: `<surname/><given-names/>` and `<phone/>` appear in all 3 real samples, never omitted |
| Section-header comments (`<!-- ======== SOURCE ======== -->` etc.) are replicated exactly via `XmlDocumentBuilder.add_comment` | (Fidelity, zero risk) | Purely cosmetic, but free to match exactly using an already-approved framework method — improves visual/diff-based comparison against real samples with no correctness risk | 3/3: identical section-header text and placement (before `transfer-source`, before `destination`, before `processing-instructions`) |

## Ambiguity handling

| Decision | Reason | Evidence |
|---|---|---|
| **ADR-007 (journal acronym, BR-133/135)**: read from `JournalConfig.acronym`, never derived from source data and never hard-coded to either observed value | This is the Business Rule Book's own highest-priority open question ("Business Confirmation Required: Yes — highest priority") — 2/3 samples use `"CLINSCI"` (absent from all source data), 1/3 uses `"CS"` (matches source `abbrev-journal-title`); no evidence-based rule can resolve which is "correct" for an unseen journal, so ADR-007's own recommended fallback (an external per-journal config table) is implemented instead of guessing | ADR-007's full text; confirmed via direct inspection that `"CLINSCI"` appears in zero source XML files despite appearing in 2/3 output packages |
| **Newly discovered this milestone**: `ArticleMeta.corresponding_emails` index 0 (the ICAM's own documented "primary" contract) does not match the real reference package's chosen contact for `CS-2025-8493_C` (which has 2 corresponding emails) — this generator uses index 0 anyway, and does **not** attempt a different selection heuristic | Re-deriving "which corresponding email is primary" is a Milestone 5B (`contributor_transformer.py`) question — this generator has no access to that layer (explicit "no transformation-layer access" boundary) and must not guess a new selection rule from the output side, which would be reverse-engineering from expected results rather than evidence-based design | `golden_baseline/CS-2025-8493_C/03_icam.json`: `corresponding_emails = [{"email": "ld454@cam.ac.uk"}, {"email": "seo10@cam.ac.uk"}]`; the real transfer.xml uses `seo10@cam.ac.uk` (index 1) |

## Assumptions explicitly rejected

| Rejected assumption | Why it was rejected |
|---|---|
| Hard-coding `"CLINSCI"` as the acronym default (majority pattern, 2/3 samples) | Majority-evidence is not the same as confirmed-correct — `"CLINSCI"` appears nowhere in any source XML, meaning it is either a Silverchair-internal code (plausible per ADR-007's own reasoning) or itself a defect; hard-coding it risks silently mis-routing every future journal that should use a different acronym |
| Deriving the acronym mechanically from `abbrev-journal-title[@abbrev-type=publisher]` (matches 1/3 samples exactly) | Would silently produce the wrong value for the 2/3 samples that use `"CLINSCI"` instead — picking either derivation rule over the other is an unevidenced guess between 2 equally-plausible, conflicting patterns from the *same organization* |
| Re-ordering or re-selecting `corresponding_emails` to make CS-2025-8493_C's golden test match byte-for-byte | Would require inventing a new "primary contact" selection rule with no evidentiary basis beyond "make this one sample match" — exactly the kind of overfitting-to-output this project's evidence-based culture rejects; the discrepancy is documented and attributed to its correct layer (Milestone 5B) instead |
| Fetching or validating the DTD at `./schema/transfer-1.0.dtd` | Explicit instruction: "Use the existing validation hook interfaces only. Do not implement validation rules." DTD system identifiers in this project are documentary/relative references only (established precedent: raw.xml/article.xml/manifest.xml/reviews.xml all treat their own DOCTYPE system ids the same way) |
| Implementing a concrete `DtdValidationHook`/`SchemaValidationHook`/`BusinessRuleValidationHook` for transfer.xml | Same instruction — those interfaces are reserved for the future `ValidationEngine` milestone; this generator's diagnostics (via `DiagnosticsCollector`) are the correct, already-established mechanism for surfacing data-quality gaps at generation time |

## Notes for Package Assembly

- **transfer.xml has zero diagnostics on all 3 real reference packages today** — every required field is populated for real data; the diagnostic paths (missing email, missing publisher-id, missing journal title, missing acronym, misconfigured processing-instruction count) are all synthetic-fixture-only today, same status as several of reviews.xml's extended-scope paths.
- **The corresponding-email ordering discrepancy** (CS-2025-8493_C) is worth flagging to whoever eventually revisits `contributor_transformer.py`'s primary-email resolution logic — this milestone deliberately did not investigate further, per its "no transformation-layer access" boundary.
- **ADR-007 must be resolved with real business input before this project can claim byte-for-byte MECA conformance** for any journal beyond the 3 already-observed samples — this is the single most consequential open item across the entire XML generation layer.
