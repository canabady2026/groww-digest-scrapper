/**
 * Central configuration. Edit these to match your Gmail labels / sheet
 * naming if you change them from the defaults described in README.md.
 */

var CONFIG = {
  // Gmail label the Daily Digest ("Mon to Fri") emails carry.
  DAILY_LABEL: '00-trading-1-groww-newsletter-digest',

  // Gmail label the Weekly Digest (Sunday) emails carry.
  WEEKLY_LABEL: '00-trading-1-groww-world-history',

  // Label applied to a thread once it has been scraped, so re-runs
  // don't duplicate rows. Created automatically on first run.
  PROCESSED_LABEL: 'groww-digest-processed',

  // Script Property key used to remember which Spreadsheet to write to.
  SPREADSHEET_ID_PROPERTY: 'GROWW_DIGEST_SPREADSHEET_ID',

  SPREADSHEET_NAME: 'Groww Digest Data',

  // How many Gmail threads to pull per search() call while paging through
  // the backlog. Each processed thread gets the "processed" label, which
  // removes it from the search query, so the run just keeps re-querying
  // batches of this size until none are left -- this is what lets a
  // single run work through an arbitrarily large backlog (not just the
  // first page of results).
  BATCH_SIZE: 100,

  // Safety valve: stop starting new batches after a run has been going
  // this long, so we never get killed mid-batch by Apps Script's
  // execution time limit (6 min for most accounts). Nothing already
  // labeled "processed" gets reprocessed, so the remaining backlog is
  // simply picked up on the next run/trigger firing.
  MAX_RUNTIME_MS: 4.5 * 60 * 1000,

  SHEETS: {
    WORD_OF_THE_DAY: {
      name: 'Word of the Day',
      headers: ['date', 'word', 'short_description', 'description']
    },
    // Note: the source spec names both course sheets "6 Day Course", but
    // a Sheet tab name must be unique within a spreadsheet and the two
    // have different columns (daily = one day's lesson, weekly = the
    // end-of-week recap quiz), so they're distinguished as below.
    DAILY_SIX_DAY_COURSE: {
      name: '6 Day Course - Daily',
      headers: ['date', 'theme', 'day', 'content']
    },
    FEATURED_QUESTION: {
      name: 'Featured Question',
      headers: ['date', 'question', 'answer']
    },
    STORY: {
      name: 'Story',
      headers: ['date', 'title', 'content', 'takeaway']
    },
    WEEKLY_SIX_DAY_COURSE: {
      name: '6 Day Course - Weekly',
      headers: ['date', 'theme', 'question', 'option1', 'option2', 'option3', 'option4', 'option5', 'answer']
    }
  }
};
