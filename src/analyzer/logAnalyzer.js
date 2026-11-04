function analyzeLog(text) {
  const patterns = [
    'ERROR', 'FATAL', 'SEVERE', 'Exception', 'Caused by:',
    'failed', 'failure', 'timeout', 'timed out', 'connection refused',
    'permission denied', 'out of memory', 'WARNING', 'WARN'
  ];

  const severityByPattern = {
    'FATAL': 'critical',
    'SEVERE': 'critical',
    'out of memory': 'critical',
    'ERROR': 'error',
    'Exception': 'error',
    'Caused by:': 'error',
    'failed': 'error',
    'failure': 'error',
    'timeout': 'error',
    'timed out': 'error',
    'connection refused': 'error',
    'permission denied': 'error',
    'WARN': 'warning',
    'WARNING': 'warning'
  };
  const severityOrder = { critical: 0, error: 1, warning: 2, unknown: 3 };

  const lines = text.split(/\r\n|\r|\n/);
  const matches = [];

  for (let index = 0; index < lines.length && matches.length < 20; index++) {
    const line = lines[index];
    const lowerCaseLine = line.toLowerCase();
    const matchedPattern = patterns.find(pattern =>
      lowerCaseLine.includes(pattern.toLowerCase())
    );
    if (matchedPattern) {
      matches.push({
        lineNumber: index + 1,
        text: line,
        pattern: matchedPattern,
        severity: severityByPattern[matchedPattern] || 'unknown',
        contextBefore: lines.slice(Math.max(0, index - 3), index),
        contextAfter: lines.slice(index + 1, index + 4)
      });
    }
  }

  matches.sort((first, second) =>
    severityOrder[first.severity] - severityOrder[second.severity] ||
    first.lineNumber - second.lineNumber
  );
  return matches;
}

module.exports = { analyzeLog };
