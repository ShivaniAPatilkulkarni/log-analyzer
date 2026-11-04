const vscode = require('vscode');
const { analyzeLog } = require('./src/analyzer/logAnalyzer');
const { detectRootCause } = require('./src/analyzer/rootCauseRules');

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

      outputChannel.clear();
      if (rootCause) {
        outputChannel.appendLine(`Root cause (rule-based): ${rootCause.category}`);
        outputChannel.appendLine(rootCause.summary);
        outputChannel.appendLine(`Evidence - Line ${rootCause.lineNumber}: ${rootCause.evidence}`);
        outputChannel.appendLine('Suggested checks:');
        for (const check of rootCause.suggestedChecks) {
          outputChannel.appendLine(`- ${check}`);
        }
        outputChannel.appendLine('');
      }
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