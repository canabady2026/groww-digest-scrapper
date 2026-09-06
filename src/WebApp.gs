/**
 * A small web app for browsing the scraped digest data: tiles/lists per
 * tab, with a cyclically-browsable full-screen popup for each entry.
 * Deploy via the Apps Script editor: Deploy > New deployment > Web app,
 * or `clasp deploy`.
 *
 * This file (plus Index.html) is the only thing that serves HTML; the
 * scraping side (Main.gs etc.) is untouched by it. The pure grouping
 * logic for the 6 Day Course tab lives in SixDayCourseGrouping.gs so it
 * can be unit tested under Node.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Groww Digest')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Tabs the client renders, in display order, with a layout hint so the
 * client knows how to present each one (tiles vs. a plain list vs. the
 * grouped 6 Day Course view).
 */
function getDigestTabs() {
  return [
    { key: 'WORD_OF_THE_DAY', label: 'Word of the Day', layout: 'tiles' },
    { key: 'SIX_DAY_COURSE', label: '6 Day Course', layout: 'course' },
    { key: 'FEATURED_QUESTION', label: 'Featured Question', layout: 'list' },
    { key: 'STORY', label: 'Story', layout: 'list' }
  ];
}

function readSheetRows_(sheetConfig) {
  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(sheetConfig.name);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheetConfig.headers.length).getValues();
  return values.map(function (row) {
    var obj = {};
    sheetConfig.headers.forEach(function (header, i) { obj[header] = row[i]; });
    return obj;
  });
}

function formatDateForDisplay_(value) {
  return Object.prototype.toString.call(value) === '[object Date]'
    ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd MMM yyyy')
    : value;
}

/**
 * Called from the client via google.script.run for the plain tiles/list
 * tabs (Word of the Day, Featured Question, Story). Returns every row
 * of the given sheet as plain objects keyed by column header, newest
 * first, with the date column formatted for display.
 */
function getDigestData(sheetKey) {
  var sheetConfig = CONFIG.SHEETS[sheetKey];
  if (!sheetConfig) {
    throw new Error('Unknown sheet: ' + sheetKey);
  }

  var rows = readSheetRows_(sheetConfig);
  rows.sort(function (a, b) {
    var timeA = Object.prototype.toString.call(a.date) === '[object Date]' ? a.date.getTime() : 0;
    var timeB = Object.prototype.toString.call(b.date) === '[object Date]' ? b.date.getTime() : 0;
    return timeB - timeA;
  });

  return rows.map(function (row) {
    var formatted = {};
    Object.keys(row).forEach(function (key) {
      formatted[key] = formatDateForDisplay_(row[key]);
    });
    return formatted;
  });
}

/**
 * Called from the client for the 6 Day Course tab. Combines the Daily
 * (Mon-Fri lessons) and Weekly (Sunday recap quiz) sheets into one
 * per-week entry each, newest week first.
 */
function getSixDayCourseData() {
  var dailyRows = readSheetRows_(CONFIG.SHEETS.DAILY_SIX_DAY_COURSE);
  var weeklyRows = readSheetRows_(CONFIG.SHEETS.WEEKLY_SIX_DAY_COURSE);
  var groups = groupSixDayCourse(dailyRows, weeklyRows);

  return groups.map(function (group) {
    var days = {};
    SIX_DAY_COURSE_DAY_ORDER.forEach(function (dayName) {
      if (dayName === 'Sunday') return;
      var row = group.days[dayName];
      days[dayName] = row ? { content: row.content, date: formatDateForDisplay_(row.date) } : null;
    });

    return {
      weekLabel: formatDateForDisplay_(group.sundayDate),
      theme: group.theme,
      days: days,
      sundayQuestions: group.sundayQuestions
    };
  });
}
