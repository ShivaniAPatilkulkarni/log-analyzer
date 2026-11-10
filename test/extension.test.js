const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function createHost(editor, moduleOverrides = {}, warningChoice) {
  if (editor && !('fileName' in editor.document)) {
    editor.document.fileName = 'test.log';
  }
  const commands = new Map();
  const output = [];
  const errors = [];
  const warnings = [];
  const subscriptions = [];
  const channelCalls = [];
  const channel = {
    clear() { channelCalls.push('clear'); output.length = 0; },
    appendLine(text) { channelCalls.push('appendLine'); output.push(text); },
    show() { channelCalls.push('show'); }
  };
  const vscode = {
    window: {
      activeTextEditor: editor,
      createOutputChannel(name) { assert.equal(name, 'Log Analyzer'); return channel; },
      showErrorMessage(message) { errors.push(message); },
      async showWarningMessage(...args) { warnings.push(args); return warningChoice; }
    },
    commands: {
      registerCommand(id, callback) {
        commands.set(id, callback);
        return { dispose() {} };
      }
    }
  };
  const extensionPath = path.resolve(__dirname, '../extension.js');
  const extensionRequire = createRequire(extensionPath);
  const sandbox = {
    module: { exports: {} },
    require(id) { return id === 'vscode' ? vscode : moduleOverrides[id] || extensionRequire(id); }
  };
  vm.runInNewContext(fs.readFileSync(extensionPath, 'utf8'), sandbox, { filename: extensionPath });
  sandbox.module.exports.activate({ subscriptions });
  assert.ok(subscriptions.includes(channel));
  return { commands, output, errors, channelCalls, warnings };
}

test('manifest and registrations contain both exact command IDs', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  const host = createHost();
  assert.deepEqual(manifest.contributes.commands, [
    { command: 'log-analyzer.analyzeLog', title: 'Log Analyzer: Analyze Current Log' },
    { command: 'log-analyzer.analyzeSelection', title: 'Log Analyzer: Analyze Selection' }
  ]);
  assert.deepEqual([...host.commands.keys()], manifest.contributes.commands.map(command => command.command));
});

test('selection command analyzes only selected text with existing formatting', async () => {
  const selection = { isEmpty: false };
  let reads = 0;
  const host = createHost({ selection, document: { getText(range) {
    assert.equal(range, selection);
    reads++;
    return 'INFO selected\nERROR Connection refused';
  } } });
  await host.commands.get('log-analyzer.analyzeSelection')();
  assert.equal(reads, 1);
  assert.deepEqual(host.errors, []);
  assert.equal(host.output[0], 'SOURCE: Selection');
  assert.ok(host.output.includes('STATUS: FAILED'));
  assert.ok(host.output.includes('Database connection failure'));
  assert.ok(host.output.includes('Line 2: ERROR Connection refused'));
  assert.ok(host.output.includes('0.95'));
  assert.ok(host.output.includes('Line 2 [error] [ERROR]: ERROR Connection refused'));
  assert.ok(host.output.includes('Line 1: INFO selected'));
});

test('empty selection skips analysis and preserves the Output Channel', async () => {
  const host = createHost({ selection: { isEmpty: true }, document: {
    getText() { assert.fail('Should not read text for empty selection'); }
  } }, {
    './src/analyzer/logAnalyzer': {
      analyzeLog() { assert.fail('Should not analyze an empty selection'); }
    },
    './src/analyzer/rootCauseRules': {
      detectRootCause() { assert.fail('Should not detect a root cause for an empty selection'); },
      buildAnalysisResult() { assert.fail('Should not build a result for an empty selection'); }
    }
  });
  host.output.push('Previous analysis results');
  await host.commands.get('log-analyzer.analyzeSelection')();
  assert.deepEqual(host.errors, ['Select log lines to analyze first.']);
  assert.deepEqual(host.warnings, []);
  assert.deepEqual(host.channelCalls, []);
  assert.deepEqual(host.output, ['Previous analysis results']);
});

test('current-file command reads the full document despite an empty selection', async () => {
  const host = createHost({ selection: { isEmpty: true }, document: {
    getText(...args) { assert.equal(args.length, 0); return 'WARN unusual event'; }
  } });
  await host.commands.get('log-analyzer.analyzeLog')();
  assert.deepEqual(host.errors, []);
  assert.equal(host.output[0], 'SOURCE: Current File');
  assert.ok(host.output.includes('STATUS: WARNING'));
  assert.ok(host.output.includes('Line 1 [warning] [WARN]: WARN unusual event'));
});

for (const id of ['log-analyzer.analyzeLog', 'log-analyzer.analyzeSelection']) {
  test(`${id} handles a missing editor`, async () => {
    const host = createHost();
    await host.commands.get(id)();
    assert.deepEqual(host.errors, ['No active file is open.']);
    assert.deepEqual(host.output, []);
  });
}

for (const id of ['log-analyzer.analyzeLog', 'log-analyzer.analyzeSelection']) {
  for (const extension of ['.log', '.txt', '.out', '.LOG']) {
    test(`${id} accepts ${extension} without warning`, async () => {
      const host = createHost({ selection: { isEmpty: false }, document: {
        fileName: `sample${extension}`,
        getText() { return 'ERROR connection refused'; }
      } });
      await host.commands.get(id)();
      assert.deepEqual(host.warnings, []);
      assert.ok(host.output.includes('Database connection failure'));
    });
  }

  test(`${id} warns for .js and Analyze Anyway continues`, async () => {
    const selection = { isEmpty: false };
    const host = createHost({ selection, document: {
      fileName: 'sample.js',
      getText(...args) {
        assert.deepEqual(args, id === 'log-analyzer.analyzeSelection' ? [selection] : []);
        return 'ERROR connection refused';
      }
    } }, {}, 'Analyze Anyway');
    await host.commands.get(id)();
    assert.deepEqual(host.warnings, [[
      'This file does not look like a log file. Analyze anyway?', 'Analyze Anyway', 'Cancel'
    ]]);
    assert.ok(host.output.includes('Database connection failure'));
    assert.equal(host.output[0], id === 'log-analyzer.analyzeSelection'
      ? 'SOURCE: Selection' : 'SOURCE: Current File');
  });

  for (const choice of ['Cancel', undefined]) {
    test(`${id} preserves output when warning response is ${choice}`, async () => {
      const host = createHost({ selection: { isEmpty: false }, document: {
        fileName: 'sample.js',
        getText() { assert.fail('Should not read text after cancellation'); }
      } }, {
        './src/analyzer/logAnalyzer': {
          analyzeLog() { assert.fail('Should not analyze after cancellation'); }
        },
        './src/analyzer/rootCauseRules': {
          detectRootCause() { assert.fail('Should not detect causes after cancellation'); },
          buildAnalysisResult() { assert.fail('Should not build results after cancellation'); }
        }
      }, choice);
      host.output.push('Previous output');
      await host.commands.get(id)();
      assert.equal(host.warnings.length, 1);
      assert.deepEqual(host.channelCalls, []);
      assert.deepEqual(host.output, ['Previous output']);
    });
  }
}

test('empty selection in .js is rejected before file-type warning', async () => {
  const host = createHost({ selection: { isEmpty: true }, document: {
    fileName: 'sample.js',
    getText() { assert.fail('Should not read empty selection'); }
  } });
  host.output.push('Previous output');
  await host.commands.get('log-analyzer.analyzeSelection')();
  assert.deepEqual(host.errors, ['Select log lines to analyze first.']);
  assert.deepEqual(host.warnings, []);
  assert.deepEqual(host.channelCalls, []);
  assert.deepEqual(host.output, ['Previous output']);
});


for (const id of ['log-analyzer.analyzeLog', 'log-analyzer.analyzeSelection']) {
  test(`${id} waits for confirmation before reading or updating output`, async () => {
    let resolveChoice;
    const pendingChoice = new Promise(resolve => { resolveChoice = resolve; });
    const selection = { isEmpty: false };
    let reads = 0;
    const host = createHost({ selection, document: {
      fileName: 'sample.js',
      getText(...args) {
        reads++;
        assert.deepEqual(args, id === 'log-analyzer.analyzeSelection' ? [selection] : []);
        return 'ERROR connection refused';
      }
    } }, {}, pendingChoice);
    host.output.push('Previous output');
    const runningCommand = host.commands.get(id)();
    assert.equal(host.warnings.length, 1);
    assert.equal(reads, 0);
    assert.deepEqual(host.channelCalls, []);
    assert.deepEqual(host.output, ['Previous output']);
    resolveChoice('Analyze Anyway');
    await runningCommand;
    assert.equal(reads, 1);
    assert.ok(host.output.includes('Database connection failure'));
  });
}
