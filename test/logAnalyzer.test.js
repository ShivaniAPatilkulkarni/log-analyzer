const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLog } = require('../src/analyzer/logAnalyzer');

for (const input of ['WARN', 'WARNING', 'warn', 'warning']) {
  test(`detects ${input} with warning severity`, () => {
    assert.deepEqual(analyzeLog(input), [{
      lineNumber: 1,
      text: input,
      pattern: input.toUpperCase(),
      severity: 'warning',
      contextBefore: [],
      contextAfter: []
    }]);
  });
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