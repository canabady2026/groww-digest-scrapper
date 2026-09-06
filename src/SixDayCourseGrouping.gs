/**
 * Groups the Daily "6 Day Course" rows (one per weekday) together with
 * the matching Weekly "6 Day Course" quiz rows (the Sunday recap) into
 * a single per-week entry: { sundayDate, theme, days: {Monday: row, ...},
 * sundayQuestions: [...] }.
 *
 * Grouping is done by calendar week (the Sunday that ends the week a
 * daily row's date falls in) rather than by matching the `theme` text
 * verbatim -- that's what lets a Monday-Friday run of daily rows line
 * up with the Sunday quiz row even if Groww's wording of the theme
 * drifts slightly between the daily and weekly templates.
 *
 * Pure function of plain row objects (each with a real `date` Date
 * field) -> plain data. No GmailApp / SpreadsheetApp / HtmlService
 * calls, so it can run under Node for testing (see test/run.js).
 */

var SIX_DAY_COURSE_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
var SIX_DAY_COURSE_DAY_ORDER = SIX_DAY_COURSE_WEEKDAYS.concat(['Sunday']);

function isDate_(value) {
  // More robust than `value instanceof Date` across separate JS realms
  // (e.g. this file loaded into its own vm context under the Node test
  // runner) -- real Apps Script execution is single-realm so this only
  // matters for testability, not production behavior.
  return Object.prototype.toString.call(value) === '[object Date]';
}

function weekEndingSunday_(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var daysToAdd = (7 - d.getDay()) % 7; // getDay(): 0 = Sunday
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

function isoDateKey_(date) {
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var day = ('0' + date.getDate()).slice(-2);
  return date.getFullYear() + '-' + month + '-' + day;
}

function groupSixDayCourse(dailyRows, weeklyRows) {
  var groups = {};

  function ensureGroup(sundayDate) {
    var key = isoDateKey_(sundayDate);
    if (!groups[key]) {
      groups[key] = { sundayDate: sundayDate, theme: '', days: {}, sundayQuestions: [] };
    }
    return groups[key];
  }

  (dailyRows || []).forEach(function (row) {
    if (!isDate_(row.date) || !row.day) return;
    var group = ensureGroup(weekEndingSunday_(row.date));
    if (!group.theme && row.theme) group.theme = row.theme;
    group.days[row.day] = row;
  });

  (weeklyRows || []).forEach(function (row) {
    if (!isDate_(row.date)) return;
    // row.date is already the Sunday itself; weekEndingSunday_ is a
    // no-op for a date that's already a Sunday, so this still keys
    // consistently with any daily rows from the same week.
    var group = ensureGroup(weekEndingSunday_(row.date));
    if (!group.theme && row.theme) group.theme = row.theme;
    group.sundayQuestions.push({
      question: row.question,
      options: [1, 2, 3, 4, 5]
        .map(function (n) { return row['option' + n]; })
        .filter(function (opt) { return opt; }),
      answer: row.answer
    });
  });

  var result = Object.keys(groups).map(function (key) { return groups[key]; });
  result.sort(function (a, b) { return b.sundayDate.getTime() - a.sundayDate.getTime(); });
  return result;
}
