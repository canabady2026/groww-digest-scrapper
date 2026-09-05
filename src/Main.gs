/**
 * Entry points. Wires GmailApp -> the pure parsers in DailyParser.gs /
 * WeeklyParser.gs -> SpreadsheetApp.
 */

function ensureProcessedLabel_() {
  var label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  }
  return label;
}

/**
 * Pages through every unprocessed thread under `label`, calling
 * `onMessage(message)` for each message and then marking the thread
 * "processed" once all its messages have been handled.
 *
 * Two things this guards against, both of which caused real data loss
 * before this existed:
 *  - A single bad email throwing inside `onMessage` used to abort the
 *    entire run via the uncaught exception, silently skipping every
 *    thread queued after it (and never labeling them, so they'd also be
 *    retried -- but only on the next manual run). Each message and each
 *    thread is now wrapped in its own try/catch so one failure just gets
 *    logged and processing continues.
 *  - Only ever fetching one page of `search()` results capped a run at
 *    that many threads even when far more were waiting. Since each
 *    processed thread gets labeled (removing it from the query), we can
 *    just keep re-querying from the top in a loop until a batch comes
 *    back empty, bounded by a wall-clock safety cutoff so we never run
 *    long enough for Apps Script to kill the execution mid-batch.
 */
function scrapeLabel_(label, onMessage) {
  var processedLabel = ensureProcessedLabel_();
  var query = 'label:"' + label + '" -label:"' + CONFIG.PROCESSED_LABEL + '"';
  var startTime = Date.now();
  var threadsProcessed = 0;
  var errorCount = 0;

  while (true) {
    var threads = GmailApp.search(query, 0, CONFIG.BATCH_SIZE);
    if (threads.length === 0) {
      break;
    }

    for (var i = 0; i < threads.length; i++) {
      var thread = threads[i];
      try {
        var messages = thread.getMessages();
        for (var j = 0; j < messages.length; j++) {
          try {
            onMessage(messages[j]);
          } catch (messageError) {
            errorCount++;
            Logger.log('Skipped message %s (thread %s): %s', messages[j].getId(), thread.getId(), messageError);
          }
        }
        thread.addLabel(processedLabel);
        threadsProcessed++;
      } catch (threadError) {
        errorCount++;
        Logger.log('Skipped thread %s entirely (left unlabeled, will retry next run): %s', thread.getId(), threadError);
      }
    }

    if (Date.now() - startTime > CONFIG.MAX_RUNTIME_MS) {
      Logger.log('%s: stopping early to stay within the execution time limit; run again to pick up the rest of the backlog.', label);
      break;
    }
  }

  Logger.log('%s: done. %s thread(s) processed, %s error(s) logged above.', label, threadsProcessed, errorCount);
}

function processDailyDigests() {
  var ss = getOrCreateSpreadsheet_();
  var wordSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.WORD_OF_THE_DAY);
  var courseSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.DAILY_SIX_DAY_COURSE);
  var questionSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.FEATURED_QUESTION);
  removeDefaultSheetIfEmpty_(ss);

  scrapeLabel_(CONFIG.DAILY_LABEL, function (message) {
    var html = message.getBody();
    var parsed = parseDailyDigest(html, message.getDate());
    var dateValue = parsed.date;

    if (parsed.wordOfTheDay) {
      appendRow_(wordSheet, {
        date: dateValue,
        word: parsed.wordOfTheDay.word,
        short_description: parsed.wordOfTheDay.shortDescription,
        description: parsed.wordOfTheDay.description
      }, CONFIG.SHEETS.WORD_OF_THE_DAY.headers);
    } else {
      Logger.log('Daily digest %s: could not find a Word of the Day section.', message.getId());
    }

    if (parsed.sixDayCourse) {
      appendRow_(courseSheet, {
        date: dateValue,
        theme: parsed.sixDayCourse.theme,
        day: parsed.sixDayCourse.day,
        content: parsed.sixDayCourse.content
      }, CONFIG.SHEETS.DAILY_SIX_DAY_COURSE.headers);
    } else {
      Logger.log('Daily digest %s: could not find a 6 Day Course section.', message.getId());
    }

    if (parsed.featuredQuestion) {
      appendRow_(questionSheet, {
        date: dateValue,
        question: parsed.featuredQuestion.question,
        answer: parsed.featuredQuestion.answer
      }, CONFIG.SHEETS.FEATURED_QUESTION.headers);
    } else {
      Logger.log('Daily digest %s: could not find a Featured Question section.', message.getId());
    }
  });
}

function processWeeklyDigests() {
  var ss = getOrCreateSpreadsheet_();
  var storySheet = getOrCreateSheet_(ss, CONFIG.SHEETS.STORY);
  var courseSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.WEEKLY_SIX_DAY_COURSE);
  removeDefaultSheetIfEmpty_(ss);

  scrapeLabel_(CONFIG.WEEKLY_LABEL, function (message) {
    var html = message.getBody();
    var parsed = parseWeeklyDigest(html, message.getSubject(), message.getDate());
    var dateValue = parsed.date;

    if (parsed.story) {
      appendRow_(storySheet, {
        date: dateValue,
        title: parsed.story.title,
        content: parsed.story.content,
        takeaway: parsed.story.takeaway
      }, CONFIG.SHEETS.STORY.headers);
    } else {
      Logger.log('Weekly digest %s: could not find a Story section.', message.getId());
    }

    if (parsed.sixDayCourse && parsed.sixDayCourse.questions.length > 0) {
      parsed.sixDayCourse.questions.forEach(function (q) {
        var row = {
          date: dateValue,
          theme: parsed.sixDayCourse.theme,
          question: q.question,
          answer: q.answer
        };
        q.options.forEach(function (opt, idx) {
          row['option' + (idx + 1)] = opt;
        });
        appendRow_(courseSheet, row, CONFIG.SHEETS.WEEKLY_SIX_DAY_COURSE.headers);
      });
    } else {
      Logger.log('Weekly digest %s: could not find a 6 Day Course quiz section.', message.getId());
    }
  });
}

/**
 * Scrapes both digest types. This is the function a time-driven trigger
 * should call.
 */
function runAll() {
  processDailyDigests();
  processWeeklyDigests();
}

/**
 * Run this once manually from the Apps Script editor (Run > setup) to
 * authorize the script's scopes and create/locate the destination
 * spreadsheet and its sheets/headers up front.
 */
function setup() {
  var ss = getOrCreateSpreadsheet_();
  getOrCreateSheet_(ss, CONFIG.SHEETS.WORD_OF_THE_DAY);
  getOrCreateSheet_(ss, CONFIG.SHEETS.DAILY_SIX_DAY_COURSE);
  getOrCreateSheet_(ss, CONFIG.SHEETS.FEATURED_QUESTION);
  getOrCreateSheet_(ss, CONFIG.SHEETS.STORY);
  getOrCreateSheet_(ss, CONFIG.SHEETS.WEEKLY_SIX_DAY_COURSE);
  removeDefaultSheetIfEmpty_(ss);
  ensureProcessedLabel_();
  Logger.log('Setup complete. Spreadsheet: %s', ss.getUrl());
}

/**
 * Run this once manually to install a daily time-driven trigger that
 * calls runAll(). Safe to re-run: it removes any existing runAll
 * trigger first so you don't end up with duplicates.
 */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runAll') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('runAll')
    .timeBased()
    .everyDays(1)
    .atHour(20)
    .create();
  Logger.log('Daily trigger installed: runAll() will run once per day, around 8pm in the script\'s timezone.');
}

/**
 * Removes the "processed" label from every thread under either digest
 * label, WITHOUT touching any spreadsheet data. Use this to force a full
 * re-scrape (e.g. after fixing a parser bug) -- but only after you've
 * cleared the stale rows out of the sheets yourself (keep the header
 * row), otherwise re-running runAll() will duplicate whatever already
 * parsed correctly the first time.
 */
function resetProcessedLabel() {
  var label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!label) {
    Logger.log('No "%s" label found; nothing to reset.', CONFIG.PROCESSED_LABEL);
    return;
  }
  var threads = label.getThreads();
  for (var i = 0; i < threads.length; i++) {
    threads[i].removeLabel(label);
  }
  Logger.log('Removed "%s" from %s thread(s). Clear the sheet rows (keep headers) before re-running runAll(), or you will get duplicates.', CONFIG.PROCESSED_LABEL, threads.length);
}
