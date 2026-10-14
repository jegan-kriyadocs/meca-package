# Package Structure Documentation — Milestone 7

Describes the exact, empirically-verified on-disk and in-zip layout
`PackageBuilder` produces, using a real run against `CS-2025-6808` as
the worked example (produced during this milestone's end-to-end
verification).

## 1. Final deliverable: `MECA_<ArticleID>.zip`

```
MECA_CS-2025-6808.zip
├── CS-2025-6808_raw.xml            ← raw_generator's own filename (BR-048)
├── CS-2025-6808_article.xml        ← article_generator's own filename (BR-073)
├── CS-2025-6808_manifest.xml       ← manifest_generator's own filename (BR-088)
├── CS-2025-6808_reviews.xml        ← reviews_generator's own filename (BR-122)
├── CS-2025-6808_transfer.xml       ← transfer_generator's own filename (BR-139)
└── files/
    ├── Original/
    │   └── fig8.jpg
    └── R1/
        ├── 1.manuscript clean21.docx
        ├── 1.manuscript highlight yellow 1.docx
        └── ... (every other manifest-declared, `files/`-prefixed href)
```

Every filename at every level — including the 5 XML files' own names and
every asset's basename — comes from the existing generators/ICAM. No
filename is invented, normalized, or renamed by `PackageBuilder`.

## 2. Directory/href convention

Every physical asset's location inside the zip is exactly the href
manifest.xml itself declares (BR-082's `files/<round_label>/<filename>`
pattern) — `PackageBuilder` never computes this path independently; it
reads it directly from the generated manifest.xml (see
`38_PACKAGE_ASSEMBLY_DECISION_LOG.md`, "Manifest-driven assembly"). The
round subfolder (`Original`, `R1`, ...) is therefore **config/data
driven wherever possible** — it is whatever `ResolvedFile.round_label`
was for that physical file, not a hard-coded or enumerated set of round
names. A hypothetical 3rd round name would produce a 3rd subfolder
automatically, with zero code change (confirmed by BR-149's own
already-established "must not assume exactly 2 rounds" invariant,
inherited unchanged into this milestone).

## 3. Intermediate, transient on-disk layout (never the deliverable)

While `PackageBuilder.build()` is running, this temporary structure
exists under `output_root` — and is guaranteed removed (whether the
build succeeds or fails) before `build()` returns or raises:

```
<output_root>/
├── .package-staging-<ArticleID>/       ← removed after success or failure
│   ├── <ArticleID>_raw.xml
│   ├── <ArticleID>_article.xml
│   ├── <ArticleID>_manifest.xml
│   ├── <ArticleID>_reviews.xml
│   ├── <ArticleID>_transfer.xml
│   └── files/<round_label>/<filename>  ← one entry per manifest-declared file
├── .MECA_<ArticleID>.zip.tmp           ← removed if build fails; renamed if it succeeds
└── MECA_<ArticleID>.zip                ← only ever created via one atomic rename
```

The leading `.` on both temporary paths is deliberate: it keeps them
out of any naive `MECA_*.zip` glob a future Output Writer or batch
monitor might run against `output_root`, so an in-progress build is
never mistaken for a completed one even by an external process
inspecting the directory mid-build.

## 4. Zip entry properties

| Property | Value | Reason |
|---|---|---|
| Entry ordering | Sorted by relative path (lexicographic) | Deterministic, reproducible output (verified: identical input → byte-identical zip across repeated builds) |
| Entry timestamp | Fixed at 1980-01-01 00:00:00 (zip format epoch) | Independent of real file mtimes, for the same reproducibility guarantee |
| Compression | Configurable — `deflated` (default) or `stored` | `PackagingSettings.zip_compression`/`.zip_compresslevel` |
| Path separator | Always `/` (POSIX), regardless of host OS | `PurePath.as_posix()`/zip format requirement |

## 5. What is config-driven vs. what is structural

| Aspect | Driven by |
|---|---|
| Round subfolder name | `ResolvedFile.round_label` (data, from the ICAM) |
| File basename | `Path(ResolvedFile.staged_physical_path).name` (data) |
| XML filenames | Each generator's own `*XmlConfig` filename-pattern settings (already config-driven since their own milestones) |
| Zip compression method/level | `PackagingSettings` (this milestone's new config) |
| Staging subdirectory naming convention | `PackagingSettings.staging_subdir_name` documents the *intended* convention; the actual runtime path additionally embeds the article_id for per-article isolation (a structural necessity for concurrent-batch safety, not a business value) |
| Overwrite behavior on a pre-existing destination file | `PackagingSettings.overwrite_policy` |
| The `files/` top-level folder name itself | **Structural** — fixed by BR-082, the same way every generator's own DOCTYPE/namespace/root-tag is structural rather than configurable, since it is part of the MECA package format's own definition, not a business or deployment value |
