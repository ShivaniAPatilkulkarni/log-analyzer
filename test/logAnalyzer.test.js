const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLog } = require('../src/analyzer/logAnalyzer');

const detectionCases = [
  ['ERROR', 'error'],
  ['FATAL', 'critical'],
  ['SEVERE', 'critical'],
  ['Exception', 'error'],
  ['Caused by:', 'error'],
  ['failed', 'error'],
  ['failure', 'error'],
  ['timeout', 'error'],
  ['timed out', 'error'],
  ['connection refused', 'error'],
  ['permission denied', 'error'],
  ['out of memory', 'critical'],
  ['WARN', 'warning'],
  ['WARNING', 'warning']
];

for (const [pattern, severity] of detectionCases) {
  for (const input of new Set([pattern, pattern.toLowerCase(), pattern.toUpperCase()])) {
    test(`detects ${input} as ${pattern} with ${severity} severity`, () => {
      assert.deepEqual(analyzeLog(`  ${input} details  `), [{
        lineNumber: 1,
        text: `  ${input} details  `,
        pattern,
        severity,
        contextBefore: [],
        contextAfter: []
      }]);
    });
  }
}
test('preserves pattern priority, context, and severity ordering', () => {
  const lines = ['WARN first', 'ERROR WARNING', 'FATAL third', 'warning fourth'];
  const results = analyzeLog(lines.join('\r\n'));
  assert.deepEqual(results.map(result => result.lineNumber), [3, 2, 1, 4]);
  assert.equal(results[1].pattern, 'ERROR');
  assert.deepEqual(results[0].contextBefore, lines.slice(0, 2));
  assert.deepEqual(results[0].contextAfter, lines.slice(3));
});

test('preserves the first 20 matches before severity sorting', () => {
  const results = analyzeLog(Array(20).fill('WARN').concat('FATAL').join('\n'));
  assert.equal(results.length, 20);
  assert.deepEqual(results.map(result => result.lineNumber),
    Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(results[19].contextAfter, ['FATAL']);
});

const contextCases = [
  ['first line', ['ERROR first', 'one', 'two', 'three', 'four'], 1, [], ['one', 'two', 'three']],
  ['last line', ['one', 'two', 'three', 'four', 'ERROR last'], 5, ['two', 'three', 'four'], []],
  ['fewer than three lines on either side', ['one', 'ERROR middle', 'two'], 2, ['one'], ['two']],
  ['single-line file', ['ERROR only'], 1, [], []],
  ['blank and whitespace lines', ['', '  ', '', 'ERROR middle', '', '\t', ''], 4, ['', '  ', ''], ['', '\t', '']]
];

for (const [label, lines, lineNumber, contextBefore, contextAfter] of contextCases) {
  test(`captures bounded context: ${label}`, () => {
    const [result] = analyzeLog(lines.join('\n'));
    assert.equal(result.lineNumber, lineNumber);
    assert.deepEqual(result.contextBefore, contextBefore);
    assert.deepEqual(result.contextAfter, contextAfter);
  });
}

for (const separator of ['\n', '\r\n', '\r']) {
  test(`preserves numbering and context with ${JSON.stringify(separator)} endings`, () => {
    assert.deepEqual(analyzeLog(['before', 'ERROR middle', 'after'].join(separator)), [{
      lineNumber: 2, text: 'ERROR middle', pattern: 'ERROR', severity: 'error',
      contextBefore: ['before'], contextAfter: ['after']
    }]);
  });
}

test('preserves line order within every severity group', () => {
  const results = analyzeLog([
    'WARN first', 'ERROR second', 'FATAL third',
    'WARNING fourth', 'Exception fifth', 'SEVERE sixth'
  ].join('\n'));
  assert.deepEqual(results.map(result => [result.severity, result.lineNumber]), [
    ['critical', 3], ['critical', 6], ['error', 2], ['error', 5], ['warning', 1], ['warning', 4]
  ]);
});

test('retains first-pattern priority rather than the first occurrence in the line', () => {
  assert.equal(analyzeLog('FATAL followed by ERROR')[0].pattern, 'ERROR');
  assert.equal(analyzeLog('FATAL followed by ERROR')[0].severity, 'error');
});

test('clean and empty logs have no suspicious matches', () => {
  assert.deepEqual(analyzeLog(''), []);
  assert.deepEqual(analyzeLog('INFO starting\n\nINFO completed'), []);
});
