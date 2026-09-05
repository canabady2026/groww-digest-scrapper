/**
 * Parses a Groww "Weekly Digest" HTML email body into the two sections
 * we track: the week's Story, and the 6 Day Course recap quiz.
 *
 * Pure function of (html, subject, fallbackDate) -> plain object. No
 * GmailApp / SpreadsheetApp calls, so it can run under Node for testing.
 */
function parseWeeklyDigest(html, subject, fallbackDate) {
  var text = htmlToText(html);
  var lines = toLines(text);
  var date = parseDateFromText(text, fallbackDate);

  var result = {
    date: date,
    story: null,
    sixDayCourse: null
  };

  var title = (subject || '').replace(/\s*-\s*Groww Digest\s*$/i, '').trim();

  var headerEndIdx = findLineIndex(lines, 'week-on-week change', 0, true);
  if (headerEndIdx === -1) headerEndIdx = 0;

  var takeawaysIdx = findLineIndex(lines, 'Takeaways', headerEndIdx, false);
  var quickTakesIdx = takeawaysIdx !== -1
    ? findLineIndex(lines, 'Quick Takes', takeawaysIdx, false)
    : -1;

  if (takeawaysIdx !== -1) {
    var contentLines = cleanSectionLines_(lines.slice(headerEndIdx + 1, takeawaysIdx));
    var takeawayEnd = quickTakesIdx !== -1 ? quickTakesIdx : lines.length;
    var takeawayLines = cleanSectionLines_(lines.slice(takeawaysIdx + 1, takeawayEnd));

    result.story = {
      title: title,
      content: contentLines.join(' '),
      takeaway: takeawayLines.join(' ')
    };
  }

  var sixIdx = findLineIndex(lines, '6-Day-Course', quickTakesIdx !== -1 ? quickTakesIdx : 0, true);
  if (sixIdx !== -1) {
    var sixEnd = findLineIndex(lines, 'Did you enjoy this issue', sixIdx, true);
    if (sixEnd === -1) sixEnd = lines.length;
    var sixLines = lines.slice(sixIdx + 1, sixEnd);

    var theme = '';
    var themeMatch = findLineIndex(sixLines, 'Theme:', 0, true);
    if (themeMatch !== -1) {
      theme = sixLines[themeMatch].replace(/^Theme:\s*/i, '').trim();
    }

    var answersIdx = findLineIndex(sixLines, 'Answers:', 0, false);
    var questionAreaEnd = answersIdx !== -1 ? answersIdx : sixLines.length;

    var questions = parseQuizQuestions_(sixLines.slice(0, questionAreaEnd));
    var answers = answersIdx !== -1 ? parseQuizAnswers_(sixLines.slice(answersIdx + 1)) : {};

    questions.forEach(function (q) {
      q.answer = answers[q.number] || '';
    });

    result.sixDayCourse = {
      theme: theme,
      questions: questions
    };
  }

  return result;
}

function cleanSectionLines_(lines) {
  return lines.filter(function (line) {
    if (line === '[[HR]]') return false;
    if (/^\[\[DAY:\w+\]\]$/.test(line)) return false;
    return true;
  });
}

function parseQuizQuestions_(lines) {
  var questions = [];
  var current = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === '[[HR]]' || /^\[\[DAY:\w+\]\]$/.test(line)) continue;

    var qHeaderMatch = line.match(/^Question\s+(\d+)\s*:\s*(.*)$/i);
    if (qHeaderMatch) {
      current = {
        number: parseInt(qHeaderMatch[1], 10),
        question: qHeaderMatch[2].trim(),
        options: []
      };
      questions.push(current);
      continue;
    }

    if (!current) continue;

    if (isOptionLine(line)) {
      current.options.push(stripOptionMarker(line));
    } else if (!current.question) {
      current.question = line;
    }
    // Any other stray line (e.g. the course intro sentence before
    // "Question 1:") is ignored since `current` is only set once a
    // "Question N:" header has been seen.
  }
  return questions;
}

function parseQuizAnswers_(lines) {
  var answers = {};
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^Q(\d+)\s*:\s*(.+)$/i);
    if (match) {
      answers[parseInt(match[1], 10)] = match[2].trim();
    }
  }
  return answers;
}
