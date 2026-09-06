/**
 * Pure string/date helpers shared by the Daily and Weekly parsers.
 * No GmailApp / SpreadsheetApp calls live here so this file can be
 * loaded and unit tested under plain Node.js (see test/run.js).
 */

var MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

/**
 * Decodes the small set of HTML entities Groww's templates actually emit.
 */
function decodeHtmlEntities(str) {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8217;|&rsquo;/gi, '’')
    .replace(/&#8216;|&lsquo;/gi, '‘')
    .replace(/&#8220;|&ldquo;/gi, '“')
    .replace(/&#8221;|&rdquo;/gi, '”')
    .replace(/&#8211;|&ndash;/gi, '–')
    .replace(/&#8212;|&mdash;/gi, '—')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCharCode(parseInt(code, 10));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
      return String.fromCharCode(parseInt(code, 16));
    });
}

/**
 * Converts a Groww digest HTML email body into a plain-text block.
 *
 * Two sentinel tokens are preserved because the parsers rely on them:
 *  - `<!--XXX Start-->` HTML comments (Groww marks the current weekday of
 *    the "6 Day Course" widget this way) become a `[[DAY:XXX]]` line.
 *  - `<hr ...>` tags, which Groww uses as section dividers, become a
 *    `[[HR]]` line.
 */
function htmlToText(html) {
  var text = html;

  // Drop non-content blocks entirely.
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');

  // Preserve the weekday marker used by the 6 Day Course widget.
  text = text.replace(/<!--\s*(\w+)\s*Start\s*-->/gi, '\n[[DAY:$1]]\n');
  text = text.replace(/<!--\s*\w+\s*End\s*-->/gi, '\n');
  // Drop any other HTML comments.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // Section dividers.
  text = text.replace(/<hr\b[^>]*>/gi, '\n[[HR]]\n');

  // Turn common block/line-break tags into newlines so paragraphs don't run together.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|table)>/gi, '\n');

  // Strip every remaining tag.
  text = text.replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text);

  // Zero-width space / non-breaking artifacts sometimes used as preheader filler.
  text = text.replace(/‌/g, '');

  return text;
}

/**
 * Like htmlToText, but returns an array of { text, html } blocks (one
 * per paragraph/line boundary) instead of a single flattened string --
 * `text` is the same plain text htmlToText would produce for that block,
 * `html` is a minimal, sanitized version keeping only <strong>/<em>
 * (attributes stripped, everything else removed) so a long section like
 * the Weekly Story can be rendered with its original paragraph breaks
 * and bold sub-headers instead of one run-on block of text.
 *
 * The two are split at exactly the same points, so `blocks.map(b =>
 * b.text)` is index-for-index identical to `toLines(htmlToText(html))`
 * -- callers can find section boundaries using the plain `.text` field
 * with the existing findLineIndex()-based logic, then use those same
 * indices to slice `.html` for display.
 */
function htmlToParagraphs(html) {
  var text = html;
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<!--\s*(\w+)\s*Start\s*-->/gi, '\n[[DAY:$1]]\n');
  text = text.replace(/<!--\s*\w+\s*End\s*-->/gi, '\n');
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  text = text.replace(/<hr\b[^>]*>/gi, '\n[[HR]]\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|table)>/gi, '\n');

  return text.split('\n').map(function (rawBlock) {
    var plain = decodeHtmlEntities(rawBlock.replace(/<[^>]+>/g, ''))
      .replace(/‌/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    var minimalHtml = rawBlock
      .replace(/<(\/?)(strong|b)\b[^>]*>/gi, '<$1strong>')
      .replace(/<(\/?)(em|i)\b[^>]*>/gi, '<$1em>');
    minimalHtml = minimalHtml.replace(/<(?!\/?(?:strong|em)\b)[^>]+>/gi, '');
    minimalHtml = decodeHtmlEntities(minimalHtml)
      .replace(/‌/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return { text: plain, html: minimalHtml };
  }).filter(function (block) { return block.text.length > 0; });
}

/**
 * Splits converted text into trimmed, non-empty lines.
 */
function toLines(text) {
  return text
    .split('\n')
    .map(function (line) { return line.replace(/\s+/g, ' ').trim(); })
    .filter(function (line) { return line.length > 0; });
}

/**
 * Finds the index of the first line equal to (or containing, if
 * `contains` is true) `needle`, starting at `fromIndex`. Returns -1 if
 * not found.
 */
function findLineIndex(lines, needle, fromIndex, contains) {
  var start = fromIndex || 0;
  for (var i = start; i < lines.length; i++) {
    if (contains ? lines[i].indexOf(needle) !== -1 : lines[i] === needle) {
      return i;
    }
  }
  return -1;
}

/**
 * Parses a "30 August 2026" / "04 September 2026" style date out of free
 * text and returns a JS Date (local, midnight). Returns `fallback` (a
 * Date) if no such pattern is found.
 */
function parseDateFromText(text, fallback) {
  var match = text.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i);
  if (!match) {
    return fallback;
  }
  var day = parseInt(match[1], 10);
  var monthIndex = MONTH_NAMES.indexOf(match[2].toLowerCase());
  var year = parseInt(match[3], 10);
  return new Date(year, monthIndex, day);
}

/**
 * True if `line` looks like a bullet/option line, e.g. "-Quarterly (4 reports)".
 */
function isOptionLine(line) {
  return /^[-–—•]\s*/.test(line);
}

function stripOptionMarker(line) {
  return line.replace(/^[-–—•]\s*/, '').trim();
}
