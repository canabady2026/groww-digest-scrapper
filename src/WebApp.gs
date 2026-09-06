/**
 * A small read-only web app for browsing the scraped digest data as
 * swipeable cards, one tab per sheet. Deploy via the Apps Script editor:
 * Deploy > New deployment > Web app.
 *
 * This file is the only one that serves HTML; the scraping side
 * (Main.gs etc.) is untouched by it.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Groww Digest')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Tabs the client renders, in display order. Keys match CONFIG.SHEETS.
 */
function getDigestTabs() {
  return [
    { key: 'WORD_OF_THE_DAY', label: 'Word of the Day' },
    { key: 'DAILY_SIX_DAY_COURSE', label: '6 Day Course (Daily)' },
    { key: 'FEATURED_QUESTION', label: 'Featured Question' },
    { key: 'STORY', label: 'Story' },
    { key: 'WEEKLY_SIX_DAY_COURSE', label: '6 Day Course (Weekly)' }
  ];
}

/**
 * Called from the client via google.script.run. Returns every row of
 * the given sheet (by CONFIG.SHEETS key) as an array of plain objects
 * keyed by column header, newest first.
 */
function getDigestData(sheetKey) {
  var sheetConfig = CONFIG.SHEETS[sheetKey];
  if (!sheetConfig) {
    throw new Error('Unknown sheet: ' + sheetKey);
  }

  var ss = getOrCreateSpreadsheet_();
  var sheet = ss.getSheetByName(sheetConfig.name);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheetConfig.headers.length).getValues();
  var dateIdx = sheetConfig.headers.indexOf('date');

  // Newest first, mirroring how you'd browse your inbox. Sorted on the
  // raw Date objects (before they're formatted to strings below) so
  // ordering is correct regardless of the order rows were appended in.
  values.sort(function (a, b) {
    var timeA = a[dateIdx] instanceof Date ? a[dateIdx].getTime() : 0;
    var timeB = b[dateIdx] instanceof Date ? b[dateIdx].getTime() : 0;
    return timeB - timeA;
  });

  var timeZone = Session.getScriptTimeZone();
  return values.map(function (row) {
    var obj = {};
    sheetConfig.headers.forEach(function (header, i) {
      var value = row[i];
      if (value instanceof Date) {
        value = Utilities.formatDate(value, timeZone, 'dd MMM yyyy');
      }
      obj[header] = value;
    });
    return obj;
  });
}
