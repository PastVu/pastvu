# Keep source filename in image history — Design

Addresses [issue #556](https://github.com/PastVu/pastvu/issues/556).

## Problem

When a photo is uploaded, its original filename is copied into the editable
`title` field (with the extension stripped) and then lost the moment the user
renames the photo. The issue asks to preserve the original filename so a user
can later recall it — for example, to find the source file on their own disk.

## Goal

Persist the original upload filename and surface it, read-only, in the photo's
history (change-log) view as part of the upload record, labeled
"Original filename".

## Non-goals

- No editing of the stored filename.
- No backfill/migration for photos uploaded before this change.
- No new UI panel — reuse the existing history view.

## Approach

Store the original filename once as an immutable field on the photo document,
and **reconstruct** the "Original filename" history line at read time from that
field. The history view's earliest entry already represents the upload moment
(it is stamped at the photo's load date `ldate`), so attaching the filename to
that entry is semantically correct and works for every photo — including those
never edited (which otherwise have no stored history entry).

This avoids duplicating the value into the `photos_history` collection and
keeps a single source of truth (`photo.filename`).

## Components & changes

### Backend

1. **`models/Photo.js`** — add `filename: { type: String }` to `PhotoSchema`.
   Holds the full original upload name including extension. Set only at
   creation; never edited afterwards.

2. **`controllers/photo.js` → `create()`** (around line 619) — alongside the
   existing `title`, set `filename` from `item.name` (the original filename
   captured by `uploader.js` as `file.originalFilename`).
   - **Sanitize at capture.** The history template renders text values
     *unescaped* via doT (`{{=value.val}}`), so a crafted filename such as
     `<img onerror=…>.jpg` would be an injection vector. Neutralize
     HTML/script-significant characters before storing, consistent with how
     PastVu handles other incoming user text (e.g. `Utils.inputIncomingParse`
     / equivalent HTML escaping). The stored value must be safe to render as-is.

3. **`controllers/photo.js` → `giveObjHist()`** — attach `photo.filename` to the
   earliest history entry's `values.filename` so it renders as a labeled value:
   - The function already fetches the photo (`photo.find` with `_id: 0`, which
     returns all fields including `filename`, and leaves `photo.user` as a raw
     `ObjectId` since `populateUser` is not passed).
   - Real history exists: set `histories[0].values.filename` (entries are sorted
     `stamp: 1`, so index 0 is the upload-time entry). This also makes a
     previously-empty first entry non-empty, so the existing
     "skip first entry if empty values" guard no longer skips it — exactly the
     desired upload record.
   - No stored history yet: the function already synthesizes a placeholder first
     entry (`{ values: { s: 0, histmissing: 1 } }`); add `filename` to it.

4. **Visibility gate (owner + staff only).** Only inject the filename when the
   viewer is the photo's owner or can moderate it. In `giveObjHist`, derive
   `iAm` from `this.handshake.usObj` and compute:

   ```js
   const canSeeFilename = iAm.registered &&
       (User.isEqual(iAm.user._id, photo.user) || !!permissions.canModerate(photo, iAm));
   ```

   `User` is already imported; `permissions` is defined in this module. Inject
   `filename` only when `canSeeFilename` is true. Other history viewers see the
   history exactly as before (no filename line).

### Frontend

5. **`public/js/module/photo/fields.js`** — add the label
   `filename: 'Original filename'` to the exported field map (used as the i18n
   key for the history value's name).

6. **`public/js/module/photo/hist.js`** — add `'filename'` to the `txtFields`
   array (line ~16) so the field is picked up into `textValuesArr` and rendered
   by the existing generic history template.

7. **i18n** — add the Russian translation to
   `public/js/lang/i18n.ru.json`:

   ```json
   "Original filename": "Исходное имя файла"
   ```

   English needs no entry: the i18next config falls back to the key itself
   (English) when no translation is present, matching the existing pattern for
   field labels like `"Photo title"` and `"Watermark signature"`. Required so
   the `i18n-completeness` test (every runtime key must resolve to Russian)
   passes.

## Data flow

```
upload → uploader.js (file.originalFilename → FileInfo.name)
       → photo.create(): store sanitized photo.filename (+ title as today)
       → user opens history panel
       → photo.giveObjHist(): if viewer is owner/moderator,
                              attach photo.filename to the upload-time entry
       → hist.js / hist.pug render: "Original filename: IMG_…jpg"
```

## Edge cases

- **Photos uploaded before this change** have no `filename` → nothing injected,
  history renders unchanged. (Their `title` still holds the original name, so
  no information was lost for them.)
- **Never-edited new photos** have no stored history; the synthetic first entry
  carries the filename, so it still shows for owner/staff.
- **Non-owner, non-staff viewers** never receive the filename from the server.
- **Hostile filenames** are sanitized at capture, so unescaped rendering is safe.

## Testing

- `i18n-completeness` and `no-russian-source` tests must stay green (new RU key
  added; no Cyrillic in source).
- Add a focused test for `giveObjHist` that verifies: (a) the filename is
  injected into the first entry for an owner/moderator viewer, and (b) it is
  absent for an unrelated viewer. Reuse the existing controller test
  infrastructure (`controllers/__tests__/*`, shared DB setup). If exercising the
  full upload→create path in tests proves too heavy, cover the injection and
  gating logic directly and document the manual verification of the upload step.
- Manual check: upload a photo, rename its title, open history as the owner →
  see "Original filename" with the original name; open as an unrelated user →
  filename absent.

## Out of scope / future

- Showing the filename anywhere other than the history view.
- Backfilling `filename` for historical photos.
