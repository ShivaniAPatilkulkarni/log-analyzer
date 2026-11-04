const vscode = require('vscode');
const { analyzeLog } = require('./src/analyzer/logAnalyzer');
const { detectRootCause, buildAnalysisResult } = require('./src/analyzer/rootCauseRules');

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('Log Analyzer');
  context.subscriptions.push(outputChannel);

  context.subscriptions.push(
    vscode.commands.registerCommand('log-analyzer.analyzeLog', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active file is open.');
        return;
      }

      const document = editor.document;
      const text = document.getText();
      const matches = analyzeLog(text);
      const rootCause = detectRootCause(matches);
      const analysis = buildAnalysisResult(matches, rootCause);

      outputChannel.clear();
      outputChannel.appendLine(`STATUS: ${analysis.status.toUpperCase()}`);
      outputChannel.appendLine('');
      outputChannel.appendLine('ROOT CAUSE:');
      outputChannel.appendLine(analysis.rootCause);
      outputChannel.appendLine('');
      outputChannel.appendLine('CATEGORY:');
      outputChannel.appendLine(analysis.category);
      outputChannel.appendLine('');
      outputChannel.appendLine('EVIDENCE:');
      outputChannel.appendLine(analysis.lineNumber === null
        ? 'None.' : `Line ${analysis.lineNumber}: ${analysis.evidence}`);
      outputChannel.appendLine('');
      outputChannel.appendLine('SUGGESTED CHECKS:');
      if (analysis.suggestedChecks.length === 0) {
        outputChannel.appendLine('None.');
      }
      for (const check of analysis.suggestedChecks) {
        outputChannel.appendLine(`- ${check}`);
      }
      outputChannel.appendLine('');
      outputChannel.appendLine('CONFIDENCE:');
      outputChannel.appendLine(analysis.confidence.toFixed(2));
      outputChannel.appendLine('');
      if (matches.length === 0) {
        outputChannel.appendLine('No obvious errors found.');
      } else {
        for (const match of matches) {
          outputChannel.appendLine('Match:');
          outputChannel.appendLine(`Line ${match.lineNumber} [${match.severity}] [${match.pattern}]: ${match.text}`);
          outputChannel.appendLine('');
          outputChannel.appendLine('Context before:');
          match.contextBefore.forEach((contextLine, contextIndex) => {
            outputChannel.appendLine(`Line ${match.lineNumber - match.contextBefore.length + contextIndex}: ${contextLine}`);
          });
          outputChannel.appendLine('');
          outputChannel.appendLine('Context after:');
          match.contextAfter.forEach((contextLine, contextIndex) => {
            outputChannel.appendLine(`Line ${match.lineNumber + 1 + contextIndex}: ${contextLine}`);
          });
          outputChannel.appendLine('');
        }
      }
      outputChannel.show(true);
    })
  );
}

module.exports = { activate };