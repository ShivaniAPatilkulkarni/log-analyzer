const rules = [
  {
    category: 'Database connection failure',
    patterns: ['connection refused', 'could not connect', 'SQLTransientConnectionException'],
    summary: 'The log indicates a database connection problem.',
    suggestedChecks: ['Check the database host and port.', 'Check database availability and network access.']
  },
  {
    category: 'Authentication failure',
    patterns: ['authentication failed', 'login failed', 'invalid credentials', 'password authentication failed'],
    summary: 'The log indicates an authentication problem.',
    suggestedChecks: ['Check the configured credentials.', 'Check the account status and authentication settings.']
  },
  {
    category: 'Timeout',
    patterns: ['timeout', 'timed out', 'TimeoutException'],
    summary: 'The log indicates that an operation timed out.',
    suggestedChecks: ['Check dependency response times and connectivity.', 'Review timeout settings and resource usage.']
  },
  {
    category: 'Memory failure',
    patterns: ['OutOfMemoryError', 'out of memory', 'heap space'],
    summary: 'The log indicates a memory allocation problem.',
    suggestedChecks: ['Check available memory and heap limits.', 'Review memory usage and recent workload changes.']
  },
  {
    category: 'Permission failure',
    patterns: ['permission denied', 'access denied', 'unauthorized', 'forbidden'],
    summary: 'The log indicates an access or permission problem.',
    suggestedChecks: ['Check the identity running the operation.', 'Check the required file, service, or resource permissions.']
  },
  {
    category: 'Database constraint failure',
    patterns: ['duplicate key', 'unique constraint', 'SQLSTATE 23505', 'ORA-00001'],
    summary: 'The log indicates a database uniqueness constraint problem.',
    suggestedChecks: ['Check for duplicate key values.', 'Review the affected constraint and insert or update operation.']
  }
];

const scoring = {
  technicalScore: 100,
  generalScore: 50,
  downstreamPenalty: 25,
  technicalPatterns: [
    'connection refused', 'SQLTransientConnectionException',
    'authentication failed', 'invalid credentials', 'TimeoutException',
    'OutOfMemoryError', 'out of memory', 'permission denied',
    'SQLSTATE 23505', 'ORA-00001'
  ],
  downstreamPatterns: [
    'job failed', 'task failed', 'stage failed', 'build failed',
    'script returned exit code', 'finished: failure'
  ]
};

function detectRootCause(results) {
  let rootCause = null;
  let bestScore = -Infinity;

  for (const result of results) {
    const contextBefore = result.contextBefore || [];
    const contextAfter = result.contextAfter || [];
    const evidenceLines = [
      ...contextBefore.map((text, index) => ({
        text, lineNumber: result.lineNumber - contextBefore.length + index
      })),
      { text: result.text, lineNumber: result.lineNumber },
      ...contextAfter.map((text, index) => ({
        text, lineNumber: result.lineNumber + 1 + index
      }))
    ];

    for (const evidenceLine of evidenceLines) {
      const lowerCaseText = evidenceLine.text.toLowerCase();
      const downstreamPenalty = scoring.downstreamPatterns.some(pattern =>
        lowerCaseText.includes(pattern)
      ) ? scoring.downstreamPenalty : 0;

      for (const rule of rules) {
        const matchingPatterns = rule.patterns.filter(pattern =>
          lowerCaseText.includes(pattern.toLowerCase())
        );
        if (matchingPatterns.length === 0) {
          continue;
        }

        const hasTechnicalPattern = matchingPatterns.some(pattern =>
          scoring.technicalPatterns.includes(pattern)
        );
        const score = (hasTechnicalPattern ? scoring.technicalScore : scoring.generalScore)
          - downstreamPenalty;
        if (score > bestScore ||
            (score === bestScore && evidenceLine.lineNumber < rootCause.lineNumber)) {
          bestScore = score;
          rootCause = {
            category: rule.category,
            summary: rule.summary,
            evidence: evidenceLine.text,
            lineNumber: evidenceLine.lineNumber,
            suggestedChecks: [...rule.suggestedChecks]
          };
        }
      }
    }
  }

  return rootCause;
}

module.exports = { detectRootCause };