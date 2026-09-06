/**
 * Temporary, read-only diagnostics for figuring out why a section isn't
 * being found across the real backlog (as opposed to the one sample
 * email the parser was built against). Safe to run any time -- these
 * only call GmailApp.search/getBody and Logger.log, never touch the
 * Sheet, labels, or anything else. Delete this file once parsing is
 * solid across the whole backlog.
 */

/**
 * Scans every Daily Digest thread and tallies each distinct short line
 * (<= 60 chars) that loosely matches "word of the day", "6 day course",
 * or contains "question" -- i.e. candidate heading text -- so we can see
 * every real variant Groww has used (emoji, punctuation, wording
 * changes, etc.) instead of guessing from a single sample email.
 *
 * Run this from the Apps Script editor (select debugHeadingVariants in
 * the function dropdown, click Run), then check View > Executions (or
 * View > Logs) for the output.
 */
function debugHeadingVariants() {
  var patterns = {
    wordOfTheDay: /word of the day/i,
    sixDayCourse: /6[\s-]*day course/i,
    featuredQuestion: /question/i
  };
  var variants = { wordOfTheDay: {}, sixDayCourse: {}, featuredQuestion: {} };

  var threads = GmailApp.search('label:"' + CONFIG.DAILY_LABEL + '"', 0, 200);
  Logger.log('Scanning %s thread(s) under %s...', threads.length, CONFIG.DAILY_LABEL);

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      var lines = toLines(htmlToText(message.getBody()));
      lines.forEach(function (line) {
        if (line.length > 60) return; // skip body sentences, keep heading-like short lines
        Object.keys(patterns).forEach(function (key) {
          if (patterns[key].test(line)) {
            variants[key][line] = (variants[key][line] || 0) + 1;
          }
        });
      });
    });
  });

  Object.keys(variants).forEach(function (key) {
    Logger.log('--- %s: %s distinct variant(s) ---', key, Object.keys(variants[key]).length);
    Object.keys(variants[key]).forEach(function (line) {
      Logger.log('%sx: "%s"', variants[key][line], line);
    });
  });
}

/**
 * Dumps the full plain-text line array for one message, in case
 * debugHeadingVariants's short-line filter hides something relevant.
 * Pass a message ID from the Executions log (e.g. "1a058fc965fb2494").
 */
function debugDumpMessageLines(messageId) {
  var message = GmailApp.getMessageById(messageId);
  var lines = toLines(htmlToText(message.getBody()));
  Logger.log(
    'Message %s (%s), %s line(s):\n%s',
    messageId,
    message.getSubject(),
    lines.length,
    lines.map(function (line, i) { return '[' + i + '] ' + line; }).join('\n')
  );
}
