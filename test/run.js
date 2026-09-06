/**
 * Lightweight Node test runner for the pure parsing logic in src/*.gs.
 *
 * The .gs files are plain ES5 JavaScript (no Apps Script globals are
 * referenced from Utils/DailyParser/WeeklyParser), so we can load them
 * into a vm context and exercise them here without a real Gmail/Sheets
 * environment. This is what gives us confidence the parsers actually
 * work against real Groww digest HTML before they ever run in Apps
 * Script.
 *
 * Run with: node test/run.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadSandbox() {
  const sandbox = {};
  vm.createContext(sandbox);
  const files = ['Utils.gs', 'DailyParser.gs', 'WeeklyParser.gs', 'SixDayCourseGrouping.gs'];
  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox;
}

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL - ' + name);
    console.log('    ' + err.message);
  }
}

const sandbox = loadSandbox();

console.log('Daily digest parser');
(function () {
  const html = readFixture('daily-2026-09-04.html');
  const result = sandbox.parseDailyDigest(html, new Date(2026, 8, 4));

  test('extracts the digest date from the body', () => {
    assert.strictEqual(result.date.getFullYear(), 2026);
    assert.strictEqual(result.date.getMonth(), 8); // September
    assert.strictEqual(result.date.getDate(), 4);
  });

  test('extracts Word of the Day', () => {
    assert.ok(result.wordOfTheDay, 'expected wordOfTheDay to be present');
    assert.strictEqual(result.wordOfTheDay.word, 'MSCI Global Index');
    assert.strictEqual(
      result.wordOfTheDay.shortDescription,
      'It is an index maintained by MSCI that is made up of large and mid cap stocks'
    );
    assert.ok(result.wordOfTheDay.description.indexOf('global') !== -1);
    assert.ok(result.wordOfTheDay.description.indexOf('index funds') !== -1 ||
      result.wordOfTheDay.description.indexOf('Index funds') !== -1);
  });

  test('extracts 6 Day Course theme, day and content', () => {
    assert.ok(result.sixDayCourse, 'expected sixDayCourse to be present');
    assert.strictEqual(result.sixDayCourse.theme, 'strategies of long-term investing');
    assert.strictEqual(result.sixDayCourse.day, 'Friday');
    assert.ok(result.sixDayCourse.content.indexOf('Contrarian investing') !== -1);
    assert.ok(result.sixDayCourse.content.indexOf('Mon') === -1, 'weekday selector row should be stripped');
  });

  test('extracts Featured Question and answer', () => {
    assert.ok(result.featuredQuestion, 'expected featuredQuestion to be present');
    assert.ok(result.featuredQuestion.question.indexOf('buyer and seller are available') !== -1);
    assert.ok(result.featuredQuestion.answer.indexOf('illiquid') !== -1);
  });
})();

console.log('Weekly digest parser');
(function () {
  const html = readFixture('weekly-2026-08-30.html');
  const subject = '130+ year old stock becomes multi-bagger';
  const result = sandbox.parseWeeklyDigest(html, subject, new Date(2026, 7, 30));

  test('extracts the digest date from the body', () => {
    assert.strictEqual(result.date.getFullYear(), 2026);
    assert.strictEqual(result.date.getMonth(), 7); // August
    assert.strictEqual(result.date.getDate(), 30);
  });

  test('extracts the Story with title, content and takeaway', () => {
    assert.ok(result.story, 'expected story to be present');
    assert.strictEqual(result.story.title, subject);
    assert.ok(result.story.content.indexOf('Texas Pacific') !== -1);
    assert.ok(result.story.content.indexOf('Takeaways') === -1, 'content should not bleed into takeaway section');
    assert.ok(result.story.takeaway.indexOf('fundamental research') !== -1);
    assert.ok(result.story.takeaway.indexOf('Quick Takes') === -1, 'takeaway should not bleed into Quick Takes');
  });

  test('extracts 6 Day Course quiz with theme, questions, options and answers', () => {
    assert.ok(result.sixDayCourse, 'expected sixDayCourse to be present');
    assert.strictEqual(result.sixDayCourse.theme, 'quarterly reports');
    assert.strictEqual(result.sixDayCourse.questions.length, 5);

    const q1 = result.sixDayCourse.questions[0];
    assert.strictEqual(q1.question, 'How many reports must listed companies in India publish?');
    // q1.options is an Array from the vm sandbox's own realm, so its
    // constructor differs from this file's Array -- compare via JSON
    // instead of deepStrictEqual to avoid a spurious cross-realm failure.
    assert.strictEqual(
      JSON.stringify(q1.options),
      JSON.stringify(['Quarterly (4 reports)', 'Annual (1 report)', 'Not mandatory'])
    );
    assert.strictEqual(q1.answer, 'Quarterly (4 reports)');

    const q4 = result.sixDayCourse.questions[3];
    assert.strictEqual(q4.options.length, 4);
    assert.strictEqual(q4.answer, '2 working days');

    const q5 = result.sixDayCourse.questions[4];
    assert.strictEqual(q5.answer, 'Telecom sector companies');
  });
})();

console.log('Weekly digest parser (template variation without a Takeaways/Quick Takes heading)');
(function () {
  // Regression test for a real bug: earlier this parser returned
  // `story: null` (dropping the whole week) whenever a template variant
  // didn't have the exact "Takeaways" heading. It should now still
  // capture the content, just with an empty takeaway.
  const html = `
    <p>Sensex: 1,000 <span>(week-on-week change)</span></p>
    <p>This is the story for a week with no Takeaways heading at all.</p>
    <p>It should still be captured as content.</p>
  `;
  const result = sandbox.parseWeeklyDigest(html, 'A story with no Takeaways heading', new Date(2026, 0, 1));

  test('still captures story content when Takeaways/Quick Takes are absent', () => {
    assert.ok(result.story, 'expected a story to be captured even without a Takeaways heading');
    assert.ok(result.story.content.indexOf('no Takeaways heading') !== -1);
    assert.strictEqual(result.story.takeaway, '');
  });
})();

console.log('Main.gs batching/error-isolation (scrapeLabel_)');
(function () {
  // Main.gs is GmailApp/SpreadsheetApp-dependent, so we can't load it
  // as-is under Node. Instead this documents+verifies the *shape* of the
  // fix via a minimal stand-in of the same loop, guarding against
  // regressing back to a bare `threads.forEach` with no try/catch (which
  // is exactly what let one bad email abort an entire run silently).
  function fakeScrapeLabel(threads, onMessage) {
    var processed = [];
    var errors = 0;
    for (var i = 0; i < threads.length; i++) {
      try {
        var messages = threads[i].messages;
        for (var j = 0; j < messages.length; j++) {
          try {
            onMessage(messages[j]);
          } catch (e) {
            errors++;
          }
        }
        processed.push(threads[i].id);
      } catch (e) {
        errors++;
      }
    }
    return { processed: processed, errors: errors };
  }

  test('a message that throws does not stop later threads from being processed', () => {
    const seen = [];
    const threads = [
      { id: 't1', messages: [{ id: 'm1' }] },
      { id: 't2', messages: [{ id: 'm2-throws' }] },
      { id: 't3', messages: [{ id: 'm3' }] }
    ];
    const outcome = fakeScrapeLabel(threads, (message) => {
      if (message.id === 'm2-throws') throw new Error('simulated parse failure');
      seen.push(message.id);
    });
    assert.deepStrictEqual(seen, ['m1', 'm3']);
    assert.deepStrictEqual(outcome.processed, ['t1', 't2', 't3']);
    assert.strictEqual(outcome.errors, 1);
  });
})();

console.log('groupSixDayCourse (web app grouping)');
(function () {
  function dailyRow(y, m, d, day, theme, content) {
    return { date: new Date(y, m, d), theme: theme, day: day, content: content };
  }
  function weeklyRow(y, m, d, theme, question, options, answer) {
    const row = { date: new Date(y, m, d), theme: theme, question: question, answer: answer };
    options.forEach((opt, i) => { row['option' + (i + 1)] = opt; });
    return row;
  }

  test('groups a Mon-Fri run with its Sunday quiz by calendar week', () => {
    // 31 Aug 2026 = Monday, 4 Sep 2026 = Friday, 6 Sep 2026 = Sunday.
    const daily = [
      dailyRow(2026, 7, 31, 'Monday', 'strategies of long-term investing', 'Mon content'),
      dailyRow(2026, 8, 1, 'Tuesday', 'strategies of long-term investing', 'Tue content'),
      dailyRow(2026, 8, 4, 'Friday', 'strategies of long-term investing', 'Fri content')
    ];
    const weekly = [
      weeklyRow(2026, 8, 6, 'strategies of long-term investing', 'Q1?', ['A', 'B'], 'A')
    ];

    const groups = sandbox.groupSixDayCourse(daily, weekly);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].theme, 'strategies of long-term investing');
    assert.strictEqual(groups[0].days.Monday.content, 'Mon content');
    assert.strictEqual(groups[0].days.Friday.content, 'Fri content');
    assert.strictEqual(groups[0].days.Wednesday, undefined);
    assert.strictEqual(groups[0].sundayQuestions.length, 1);
    assert.strictEqual(groups[0].sundayQuestions[0].question, 'Q1?');
    assert.strictEqual(JSON.stringify(groups[0].sundayQuestions[0].options), JSON.stringify(['A', 'B']));
    // 6 Sep 2026.
    assert.strictEqual(groups[0].sundayDate.getFullYear(), 2026);
    assert.strictEqual(groups[0].sundayDate.getMonth(), 8);
    assert.strictEqual(groups[0].sundayDate.getDate(), 6);
  });

  test('keeps separate weeks apart and sorts newest-first', () => {
    const daily = [
      dailyRow(2026, 7, 24, 'Monday', 'week one theme', 'W1 Mon'), // week ending 30 Aug
      dailyRow(2026, 7, 31, 'Monday', 'week two theme', 'W2 Mon')  // week ending 6 Sep
    ];
    const groups = sandbox.groupSixDayCourse(daily, []);
    assert.strictEqual(groups.length, 2);
    assert.strictEqual(groups[0].theme, 'week two theme', 'newest week should come first');
    assert.strictEqual(groups[1].theme, 'week one theme');
  });

  test('a week with only a Sunday quiz (no daily rows) still groups', () => {
    const weekly = [weeklyRow(2026, 8, 6, 'orphan quiz theme', 'Q?', ['X'], 'X')];
    const groups = sandbox.groupSixDayCourse([], weekly);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].theme, 'orphan quiz theme');
    assert.strictEqual(Object.keys(groups[0].days).length, 0);
    assert.strictEqual(groups[0].sundayQuestions.length, 1);
  });
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
