# Groww Digest Scrapper

A Google Apps Script that reads your **Groww Daily Digest** (Mon–Fri) and
**Groww Weekly Digest** (Sunday) emails out of Gmail and appends the
structured content to a Google Sheet, one row per item.

It relies on two Gmail labels you already have set up:

| Digest | Gmail label |
|---|---|
| Daily Digest | `00-trading-1-groww-newsletter-digest` |
| Weekly Digest | `00-trading-1-groww-world-history` |

## What gets extracted

**From the Daily Digest**, three sheets:

| Sheet | Columns |
|---|---|
| `Word of the Day` | `date`, `word`, `short_description`, `description` |
| `6 Day Course - Daily` | `date`, `theme`, `day`, `content` |
| `Featured Question` | `date`, `question`, `answer` |

**From the Weekly Digest**, two sheets:

| Sheet | Columns |
|---|---|
| `Story` | `date`, `title`, `content`, `takeaway` |
| `6 Day Course - Weekly` | `date`, `theme`, `question`, `option1`...`option5`, `answer` (one row per quiz question) |

> The source spec names both course sheets "6 Day Course", but a sheet
> tab name has to be unique per spreadsheet and the daily/weekly
> versions have different columns (one day's lesson vs. the end-of-week
> recap quiz), so they're named `6 Day Course - Daily` and
> `6 Day Course - Weekly`. Rename them in `src/Config.gs` if you'd like
> something else.

Everything else in the emails (market tables, top gainers/losers, Quick
Takes, stock news, etc.) is intentionally ignored — only the sections
above are captured, per the spec.

## How it works

- `src/Utils.gs` — HTML→text conversion and date parsing helpers.
- `src/DailyParser.gs` / `src/WeeklyParser.gs` — pure functions that turn
  a digest's HTML body into structured data. These have **no** Gmail or
  Sheets dependency, which is what lets them be unit tested under plain
  Node (see [Testing](#testing) below).
- `src/SheetHelpers.gs` — creates/reuses the destination spreadsheet and
  sheets, and appends rows.
- `src/Main.gs` — the entry points: `processDailyDigests()`,
  `processWeeklyDigests()`, `runAll()`, plus one-time `setup()` and
  `createDailyTrigger()` helpers.
- `src/Config.gs` — label names, sheet names/columns, and the
  batching/runtime settings, all in one place.
- `src/WebApp.gs` / `src/Index.html` — a read-only web app for browsing
  the scraped data as swipeable cards, one tab per sheet (see
  [Browsing the data as a web app](#browsing-the-data-as-a-web-app)).

Each Gmail **thread** is labeled `groww-digest-processed` once its
messages have been scraped, and the search query used to find new
digests excludes that label — so re-running `runAll()` (e.g. via the
daily trigger) never creates duplicate rows, *as long as that label stays
applied* (see [Forcing a re-scrape](#forcing-a-re-scrape) if you ever need
to undo that intentionally).

A single call to `processDailyDigests()` / `processWeeklyDigests()` pages
through the **entire** backlog under its label, not just the first batch:
it keeps re-querying (each processed thread drops out of the query once
labeled) until nothing unprocessed is left, or until it's been running for
~4.5 minutes (`MAX_RUNTIME_MS` in `Config.gs`), in which case it stops
cleanly and picks up the remainder on the next run. Each thread and each
message inside it is also processed in its own try/catch, so one
malformed or unexpected email can't silently abort the whole run and
leave everything queued after it unprocessed.

## Setup

1. **Create the Apps Script project.**
   - Easiest: go to [script.google.com](https://script.google.com), create a
     new project, and copy the contents of each file under `src/` into a
     matching file in the editor (use the same filenames, e.g. `Config.gs`,
     `Utils.gs`, etc.). Apps Script's default `Code.gs` can be deleted.
   - Or, with [`clasp`](https://github.com/google/clasp) installed:
     ```
     npm install -g @google/clasp
     clasp login
     clasp create --title "Groww Digest Scrapper" --type standalone --rootDir src
     ```
     Then copy `.clasp.json.example` to `.clasp.json` (already gitignored)
     and fill in the `scriptId` clasp printed, or the one `clasp create`
     wrote for you. Push with `clasp push`.

2. **Confirm your Gmail labels match** `00-trading-1-groww-newsletter-digest`
   and `00-trading-1-groww-world-history` (these are exactly what's used in
   the search queries). If yours differ, edit `DAILY_LABEL` /
   `WEEKLY_LABEL` in `Config.gs`.

3. **Run `setup` once** from the Apps Script editor (select `setup` in the
   function dropdown, click Run). This will:
   - Prompt you to authorize the Gmail (read/modify, for labeling) and
     Sheets scopes.
   - Create a new Google Sheet called "Groww Digest Data" (or reuse one
     if you run `setup` again) and pre-create all five sheets with headers.
   - Create the `groww-digest-processed` Gmail label.
   - Log the spreadsheet URL — check **View > Logs** (or **Executions**)
     for it.

4. **Run `runAll` once manually** to do an initial backfill of whatever
   digests are currently sitting under those labels.

5. **Install the daily trigger** by running `createDailyTrigger` once.
   This schedules `runAll()` to run once a day (default ~8pm, script
   timezone `Asia/Kolkata` — change `timeZone` in `appsscript.json` and
   the `.atHour(...)` call in `createDailyTrigger()` if you want a
   different time). You can also add the trigger by hand from the
   Apps Script editor's **Triggers** page instead.

That's it — new Daily/Weekly Digest emails under those labels will be
scraped into the sheet automatically going forward.

## Forcing a re-scrape

If you've updated the parser (e.g. pulled a fix for a section that wasn't
being captured) and want to backfill previously-processed emails with
corrected data:

1. In the destination spreadsheet, clear out the stale data rows in the
   affected sheet(s) — **keep the header row**.
2. Run `resetProcessedLabel()` once from the Apps Script editor. This
   removes the `groww-digest-processed` label from every thread under
   both digest labels (it does **not** touch the spreadsheet).
3. Run `runAll()` again — everything is now "unprocessed" again and gets
   re-scraped from scratch with the fixed parser.

Skipping step 1 will duplicate every row that was already captured
correctly, since `resetProcessedLabel()` has no way to know which rows in
the sheet came from which thread.

## Browsing the data as a web app

`src/WebApp.gs` + `src/Index.html` serve a small read-only page with one
tab per sheet, and cards you browse with ‹ › buttons, arrow keys, or a
swipe (newest first, like flipping through your inbox).

To deploy it:

1. In the Apps Script editor: **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set **Execute as: Me**, **Who has access: Only myself** (change this
   later if you want to share the link — "Only myself" just means it
   checks your Google identity, so it still works from your phone or any
   other device as long as you're signed into the same account).
4. Click **Deploy**, then copy the web app URL it gives you.

Or, with clasp already set up (see Setup above):
```
clasp deploy --description "Groww Digest browser web app"
clasp deployments   # lists the deployment ID
```
The URL is `https://script.google.com/macros/s/<deploymentId>/exec`.

**Important:** redeploying only takes effect for the *web app*, not for
scraping. Editing `src/WebApp.gs` or `src/Index.html` and running
`clasp push` updates the underlying script, but the live web app URL
keeps serving whatever was there at the last `clasp deploy` (or the last
"New deployment"/"Manage deployments > Edit" in the UI) until you deploy
again:
```
clasp deploy -i <deploymentId> -d "description of the update"
```
This is intentional Apps Script behavior — it means a code change never
changes what's live until you explicitly redeploy.

## Testing

`src/DailyParser.gs` and `src/WeeklyParser.gs` are plain, dependency-free
JavaScript, so they're covered by a small Node test suite that runs them
against two real (sanitized) Groww digest emails saved under
`test/fixtures/`:

```
npm test
```

This is useful if Groww tweaks their email template and a parser needs
adjusting — update the fixture (or add a new one) and re-run the parser
against it before pushing changes back into the live Apps Script project.

## Notes / limitations

- Parsing is done via lightweight HTML→text conversion plus known
  section headings ("Word of the Day", "6 Day Course", "Featured
  Question", "Takeaways", "Quick Takes", "6-Day-Course", "Answers:",
  etc.) rather than a full HTML/DOM parser (Apps Script doesn't ship
  one). If Groww changes these headings or the overall template
  structure, the corresponding parser will need updating — the Node
  tests are there to make that safe to iterate on.
- If a digest doesn't contain one of the tracked sections (e.g. the
  daily template runs a week without a Featured Question), that row is
  simply skipped for that email; the run continues and other sections
  still get written. Check **Executions** in the Apps Script editor for
  a log line when a section isn't found, or when a thread/message was
  skipped due to an error.
- The Weekly `Story` parser falls back gracefully if a template variant
  is missing the "Takeaways" or "Quick Takes" heading it normally
  anchors on (it still captures the story `content`, just with an empty
  `takeaway`) — but it's only been verified against one real sample
  email so far. If `Story` or the quiz ever comes out empty/garbled for
  a particular week, check the Executions log for that message's ID —
  it's easy to turn that email into a new fixture under
  `test/fixtures/` to fix the parser against (see Testing above).
- `BATCH_SIZE` / `MAX_RUNTIME_MS` (in `Config.gs`) control how the
  backlog is paged through per run — see "How it works" above. You
  shouldn't need to touch these unless your backlog is unusually large.
