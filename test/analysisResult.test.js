const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLog } = require('../src/analyzer/logAnalyzer');
const { detectRootCause, buildAnalysisResult } = require('../src/analyzer/rootCauseRules');

const cases = [
  ['specific technical cause', 'ERROR connection refused', 'failed', 0.95],
  ['less-specific known cause', 'ERROR could not connect', 'failed', 0.75],
  ['unknown suspicious error', 'ERROR unexpected problem', 'failed', 0.40],
  ['clean log', 'INFO started', 'unknown', 0.10],
  ['empty log', '', 'unknown', 0.10],
  ['warning only', 'WARN unusual event', 'warning', 0.40]
];

for (const [label, text, status, confidence] of cases) {
  test(`builds structured result for ${label}`, () => {
    const matches = analyzeLog(text);
    const rootCause = detectRootCause(matches);
    const result = buildAnalysisResult(matches, rootCause);
    assert.equal(result.status, status);
    assert.equal(result.confidence, confidence);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.deepEqual(Object.keys(result).sort(), [
      'status', 'rootCause', 'category', 'evidence', 'lineNumber', 'suggestedChecks', 'confidence'
    ].sort());
    assert.equal(typeof result.rootCause, 'string');
    assert.ok(Array.isArray(result.suggestedChecks));
    if (rootCause) {
      assert.equal(result.rootCause, rootCause.summary);
      assert.equal(result.category, rootCause.category);
      assert.equal(result.evidence, rootCause.evidence);
      assert.equal(result.lineNumber, rootCause.lineNumber);
      assert.deepEqual(result.suggestedChecks, rootCause.suggestedChecks);
      assert.notEqual(result.suggestedChecks, rootCause.suggestedChecks);
    } else {
      assert.equal(result.category, 'unknown');
      assert.equal(result.evidence, matches.length ? text : null);
      assert.equal(result.lineNumber, matches.length ? 1 : null);
      assert.deepEqual(result.suggestedChecks, []);
    }
  });
}

test('uses the ranked cause and its original evidence line', () => {
  const matches = analyzeLog('ERROR timeout\nERROR connection refused');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.category, 'Database connection failure');
  assert.equal(result.lineNumber, 2);
  assert.equal(result.confidence, 0.95);
});

test('recognizes case-insensitive specificity in captured context', () => {
  const matches = analyzeLog('ERROR operation\nSQLSTATE 23505');
  const result = buildAnalysisResult(matches, detectRootCause(matches));
  assert.equal(result.confidence, 0.95);
  assert.equal(result.lineNumber, 2);
});