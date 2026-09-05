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

function processDailyDigests() {
  var ss = getOrCreateSpreadsheet_();
  var wordSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.WORD_OF_THE_DAY);
  var courseSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.DAILY_SIX_DAY_COURSE);
  var questionSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.FEATURED_QUESTION);
  removeDefaultSheetIfEmpty_(ss);

  var processedLabel = ensureProcessedLabel_();
  var query = 'label:"' + CONFIG.DAILY_LABEL + '" -label:"' + CONFIG.PROCESSED_LABEL + '"';
  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);

  Logger.log('Daily digest: found %s unprocessed thread(s).', threads.length);

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
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
    thread.addLabel(processedLabel);
  });
}

function processWeeklyDigests() {
  var ss = getOrCreateSpreadsheet_();
  var storySheet = getOrCreateSheet_(ss, CONFIG.SHEETS.STORY);
  var courseSheet = getOrCreateSheet_(ss, CONFIG.SHEETS.WEEKLY_SIX_DAY_COURSE);
  removeDefaultSheetIfEmpty_(ss);

  var processedLabel = ensureProcessedLabel_();
  var query = 'label:"' + CONFIG.WEEKLY_LABEL + '" -label:"' + CONFIG.PROCESSED_LABEL + '"';
  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN);

  Logger.log('Weekly digest: found %s unprocessed thread(s).', threads.length);

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
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
    thread.addLabel(processedLabel);
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
