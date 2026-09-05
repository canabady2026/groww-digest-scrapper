/**
 * Spreadsheet-side helpers. These are the only functions in the project
 * (besides Main.gs) that touch SpreadsheetApp.
 */

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(CONFIG.SPREADSHEET_ID_PROPERTY);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // Stored ID no longer resolves (deleted/moved) -- fall through and
      // create a fresh spreadsheet below.
    }
  }

  var ss = SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME);
  props.setProperty(CONFIG.SPREADSHEET_ID_PROPERTY, ss.getId());
  Logger.log('Created new spreadsheet: %s', ss.getUrl());
  return ss;
}

function getOrCreateSheet_(ss, sheetConfig) {
  var sheet = ss.getSheetByName(sheetConfig.name);
  if (!sheet) {
    sheet = ss.insertSheet(sheetConfig.name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, sheetConfig.headers.length).setValues([sheetConfig.headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRow_(sheet, rowObject, headers) {
  var row = headers.map(function (header) {
    var value = rowObject[header];
    return value === undefined || value === null ? '' : value;
  });
  sheet.appendRow(row);
}

/**
 * Removes the default "Sheet1" tab Spreadsheet.create() leaves behind,
 * once at least one real sheet exists.
 */
function removeDefaultSheetIfEmpty_(ss) {
  var sheet = ss.getSheetByName('Sheet1');
  if (sheet && ss.getSheets().length > 1 && sheet.getLastRow() === 0) {
    ss.deleteSheet(sheet);
  }
}
