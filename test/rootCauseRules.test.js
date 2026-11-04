const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLog } = require('../src/analyzer/logAnalyzer');
const { detectRootCause } = require('../src/analyzer/rootCauseRules');

const categories = [
  ['Database connection failure', ['connection refused', 'could not connect', 'SQLTransientConnectionException']],
  ['Authentication failure', ['authentication failed', 'login failed', 'invalid credentials', 'password authentication failed']],
  ['Timeout', ['timeout', 'timed out', 'TimeoutException']],
  ['Memory failure', ['OutOfMemoryError', 'out of memory', 'heap space']],
  ['Permission failure', ['permission denied', 'access denied', 'unauthorized', 'forbidden']],
  ['Database constraint failure', ['duplicate key', 'unique constraint', 'SQLSTATE 23505', 'ORA-00001']]
];

for (const [category, patterns] of categories) {
  for (const pattern of patterns) {
    test(`detects ${pattern}`, () => {
      const text = `ERROR ${pattern.toUpperCase()}`;
      const result = detectRootCause(analyzeLog(text));
      assert.equal(result.category, category);
      assert.equal(result.evidence, text);
      assert.equal(result.lineNumber, 1);
      assert.equal(typeof result.summary, 'string');
      assert.ok(result.summary.length > 0);
      assert.ok(result.suggestedChecks.length > 0);
      assert.ok(result.suggestedChecks.every(check => typeof check === 'string'));
    });
  }
}

test('returns null when no root cause matches', () => {
  assert.equal(detectRootCause([]), null);
  assert.equal(detectRootCause(analyzeLog('ERROR something happened')), null);
});

test('selects the earliest line despite severity sorting', () => {
  const results = analyzeLog('ERROR authentication failed\nFATAL out of memory');
  assert.equal(results[0].lineNumber, 2);
  assert.equal(detectRootCause(results).category, 'Authentication failure');
  assert.equal(detectRootCause(results).lineNumber, 1);
});

test('finds SQLSTATE evidence in context with its original line number', () => {
  const results = analyzeLog('INFO starting\nSQLSTATE 23505\nERROR database operation');
  const result = detectRootCause(results);
  assert.equal(result.category, 'Database constraint failure');
  assert.equal(result.evidence, 'SQLSTATE 23505');
  assert.equal(result.lineNumber, 2);
});

test('finds evidence after a suspicious line', () => {
  const result = detectRootCause(analyzeLog('ERROR database operation\ninvalid credentials'));
  assert.equal(result.category, 'Authentication failure');
  assert.equal(result.lineNumber, 2);
});

test('uses declared rule order when multiple categories match the same line', () => {
  assert.equal(detectRootCause(analyzeLog('ERROR timeout connection refused')).category,
    'Database connection failure');
});

const rankingCases = [
  ['job failed', 'connection refused', 'Database connection failure'],
  ['task failed', 'authentication failed', 'Authentication failure'],
  ['build failed', 'TimeoutException', 'Timeout']
];

for (const [downstream, technical, category] of rankingCases) {
  test(`${technical} beats ${downstream}`, () => {
    const result = detectRootCause(analyzeLog(`ERROR ${downstream}\nERROR ${technical}`));
    assert.equal(result.category, category);
    assert.equal(result.lineNumber, 2);
  });
}

test('a later technical cause outranks an earlier general cause', () => {
  const result = detectRootCause(analyzeLog('ERROR timeout\nERROR connection refused'));
  assert.equal(result.category, 'Database connection failure');
  assert.equal(result.lineNumber, 2);
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('earlier line wins equal technical scores despite severity sorting', () => {
  const result = detectRootCause(analyzeLog('ERROR permission denied\nFATAL OutOfMemoryError'));
  assert.equal(result.category, 'Permission failure');
  assert.equal(result.lineNumber, 1);
});

test('earlier line wins equal general scores', () => {
  const result = detectRootCause(analyzeLog('ERROR timeout\nERROR could not connect'));
  assert.equal(result.category, 'Timeout');
  assert.equal(result.lineNumber, 1);
});

test('ranks competing categories on the same line', () => {
  const result = detectRootCause(analyzeLog('ERROR could not connect: TimeoutException'));
  assert.equal(result.category, 'Timeout');
});

for (const downstream of [
  'job failed', 'task failed', 'stage failed', 'build failed',
  'script returned exit code', 'finished: failure'
]) {
  test(`deprioritizes evidence containing ${downstream}`, () => {
    const result = detectRootCause(analyzeLog(
      `ERROR ${downstream.toUpperCase()}: connection refused\nERROR permission denied`
    ));
    assert.equal(result.category, 'Permission failure');
    assert.equal(result.lineNumber, 2);
    assert.equal(detectRootCause(analyzeLog(`ERROR ${downstream}`)), null);
  });
}
