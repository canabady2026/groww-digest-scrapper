/**
 * Parses a Groww "Daily Digest" HTML email body into the three sections
 * we track: Word of the Day, 6 Day Course, and Featured Question.
 *
 * Pure function of (html, fallbackDate) -> plain object. No GmailApp /
 * SpreadsheetApp calls, so it can run under Node for testing.
 */
function parseDailyDigest(html, fallbackDate) {
  var text = htmlToText(html);
  var lines = toLines(text);
  var date = parseDateFromText(text, fallbackDate);

  var result = {
    date: date,
    wordOfTheDay: null,
    sixDayCourse: null,
    featuredQuestion: null
  };

  // Each heading is searched independently from the start of the email,
  // not assuming any fixed order relative to the others -- Groww has
  // used more than one section ordering across the life of this digest
  // (confirmed via debugHeadingVariants: "Featured Question" exists as
  // an exact heading line in the large majority of real emails, yet
  // chaining search positions sequentially -- searching for it only
  // after wherever "6 Day Course" was found -- missed it in every
  // single one, because in most of the backlog it actually comes
  // *before* "6 Day Course").
  var wodIdx = findLineIndex(lines, 'Word of the Day', 0, false);
  var sixIdx = findLineIndex(lines, '6 Day Course', 0, false);
  var fqIdx = findLineIndex(lines, 'Featured Question', 0, false);

  var headingIndexes = [wodIdx, sixIdx, fqIdx]
    .filter(function (i) { return i !== -1; })
    .sort(function (a, b) { return a - b; });

  function nextHeadingAfter_(idx) {
    for (var i = 0; i < headingIndexes.length; i++) {
      if (headingIndexes[i] > idx) return headingIndexes[i];
    }
    return lines.length;
  }

  if (wodIdx !== -1) {
    var wodLines = filterNoiseLines_(lines.slice(wodIdx + 1, nextHeadingAfter_(wodIdx)));
    if (wodLines.length > 0) {
      result.wordOfTheDay = {
        word: wodLines[0] || '',
        shortDescription: wodLines[1] || '',
        description: wodLines.slice(2).join(' ')
      };
    }
  }

  if (sixIdx !== -1) {
    var sixLinesRaw = lines.slice(sixIdx + 1, nextHeadingAfter_(sixIdx));

    var theme = '';
    var day = '';
    var contentLines = [];
    for (var i = 0; i < sixLinesRaw.length; i++) {
      var line = sixLinesRaw[i];
      var dayMatch = line.match(/^\[\[DAY:(\w+)\]\]$/);
      if (dayMatch) {
        day = dayMatch[1];
        continue;
      }
      if (line === '[[HR]]') {
        continue;
      }
      if (/^Theme:/i.test(line)) {
        theme = line.replace(/^Theme:\s*/i, '').trim();
        continue;
      }
      if (isWeekdaySelectorLine_(line)) {
        continue;
      }
      contentLines.push(line);
    }

    result.sixDayCourse = {
      theme: theme,
      day: day,
      content: contentLines.join(' ')
    };
  }

  if (fqIdx !== -1) {
    var endCandidates = [nextHeadingAfter_(fqIdx)];
    var disclaimerIdx = findLineIndex(lines, "we'll try to answer one burning question", fqIdx + 1, true);
    if (disclaimerIdx !== -1) endCandidates.push(disclaimerIdx);
    var diveDeeperIdx = findLineIndex(lines, 'Dive Deeper', fqIdx + 1, false);
    if (diveDeeperIdx !== -1) endCandidates.push(diveDeeperIdx);
    var fqEnd = Math.min.apply(null, endCandidates);

    var fqLines = filterNoiseLines_(lines.slice(fqIdx + 1, fqEnd));
    if (fqLines.length > 0) {
      var question = fqLines[0].replace(/^Q[.:]?\s*/i, '').trim();
      var answer = fqLines.slice(1).join(' ').trim();
      result.featuredQuestion = {
        question: question,
        answer: answer
      };
    }
  }

  return result;
}

function filterNoiseLines_(lines) {
  return lines.filter(function (line) {
    if (line === '[[HR]]') return false;
    if (/^\[\[DAY:\w+\]\]$/.test(line)) return false;
    if (isWeekdaySelectorLine_(line)) return false;
    return true;
  });
}

/**
 * Detects the glued-together "MonTueWedThuFriSun" weekday-selector row
 * that results from stripping tags out of the 6 Day Course widget (the
 * individual <span> weekday labels have no separating whitespace).
 */
function isWeekdaySelectorLine_(line) {
  return /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun){2,}$/.test(line);
}
