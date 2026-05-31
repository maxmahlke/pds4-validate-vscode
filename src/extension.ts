// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

const LAST_ARGS_KEY = 'pds4-validate.lastArgs';
const RECENT_ARGS_KEY = 'pds4-validate.recentArgs';
const MAX_RECENT_ARGS = 10;
const PRESET_FILE_NAME = 'pds4-validate.json';
const DEFAULT_WORKSPACE_PRESETS: WorkspacePreset[] = [
	{ name: 'Config File', args: '-c config.txt' }
];

type WorkspacePreset = {
	name: string;
	args: string;
};

type ValidationMessage = {
	level: 'ERROR' | 'WARNING' | 'INFO';
	label: string;
	line?: string;
	message: string;
};

function extractMessagesFromOutput(text: string): ValidationMessage[] {
	const lines = text.split(/\r?\n/);
	const messages: ValidationMessage[] = [];

	for (const line of lines) {
		const messageMatch = line.match(/^\s*(ERROR|WARNING|INFO)\s+\[([^\]]+)\]\s+(?:(line\s+[^:]+):\s+)?(.+)$/);
		if (!messageMatch) {
			continue;
		}

		messages.push({
			level: messageMatch[1] as ValidationMessage['level'],
			label: messageMatch[2],
			line: messageMatch[3],
			message: messageMatch[4]
		});
	}

	return messages;
}

function parseLineAndColumn(lineReference?: string): { line: number; column: number } | undefined {
	if (!lineReference) {
		return undefined;
	}

	const match = lineReference.match(/line\s+(\d+)(?:,\s*(\d+))?/i);
	if (!match) {
		return undefined;
	}

	const line = Number.parseInt(match[1], 10);
	const column = match[2] ? Number.parseInt(match[2], 10) : 1;
	if (!Number.isFinite(line) || !Number.isFinite(column) || line < 1 || column < 1) {
		return undefined;
	}

	return { line, column };
}

async function updateDiagnosticsForFile(
	filePath: string,
	rawOutput: string,
	diagnostics: vscode.DiagnosticCollection,
	output: vscode.OutputChannel
): Promise<void> {
	const fileUri = vscode.Uri.file(filePath);
	const parsedMessages = extractMessagesFromOutput(rawOutput);

	if (parsedMessages.length === 0) {
		diagnostics.set(fileUri, []);
		output.appendLine('No WARNING/ERROR lines were found; published 0 diagnostics.');
		return;
	}

	const document = await vscode.workspace.openTextDocument(fileUri);
	const docLineCount = document.lineCount;
	const nextDiagnostics: vscode.Diagnostic[] = [];

	for (const entry of parsedMessages) {
		if (entry.level !== 'ERROR' && entry.level !== 'WARNING') {
			continue;
		}

		const parsedLocation = parseLineAndColumn(entry.line);
		const lineIndex = parsedLocation ? Math.min(Math.max(parsedLocation.line - 1, 0), Math.max(docLineCount - 1, 0)) : 0;
		const columnIndex = parsedLocation ? Math.max(parsedLocation.column - 1, 0) : 0;
		const lineLength = document.lineAt(lineIndex).text.length;
		const startChar = Math.min(columnIndex, lineLength);
		const endChar = Math.min(startChar + 1, Math.max(lineLength, 1));
		const severity = entry.level === 'ERROR' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
		const range = severity === vscode.DiagnosticSeverity.Warning
			? new vscode.Range(lineIndex, 0, lineIndex, lineLength)
			: new vscode.Range(lineIndex, startChar, lineIndex, endChar);

		const diagnostic = new vscode.Diagnostic(
			range,
			`[${entry.label}] ${entry.message}`,
			severity
		);
		diagnostic.source = 'pds4-validate';
		diagnostic.code = entry.label;
		nextDiagnostics.push(diagnostic);
	}

	diagnostics.set(fileUri, nextDiagnostics);
	output.appendLine(`Published ${nextDiagnostics.length} WARNING/ERROR diagnostics for ${filePath}.`);
}

function buildValidationReport(sourcePath: string, exitCode: number | null, rawOutput: string): string {
	return rawOutput;
}

function getValidationReportPath(filePath: string): string {
	const baseNameWithoutExtension = path.parse(filePath).name;
	return path.join(path.dirname(filePath), `validate_${baseNameWithoutExtension}.txt`);
}

async function showValidationReport(reportPath: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(reportPath));
	await vscode.window.showTextDocument(document, {
		preview: false,
		preserveFocus: true
	});
}

function quoteForShell(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tokenizeArgs(args: string): string[] {
	const tokens: string[] = [];
	const pattern = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+)/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(args)) !== null) {
		const token = match[1] ?? match[2] ?? match[3] ?? '';
		tokens.push(token.replace(/\\([\\"'])/g, '$1'));
	}

	return tokens;
}

function extractReportPathFromArgs(args: string): string | undefined {
	const tokens = tokenizeArgs(args);

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === '--report-file' || token === '-r') {
			const next = tokens[index + 1];
			return next && !next.startsWith('-') ? next : undefined;
		}

		if (token.startsWith('--report-file=')) {
			return token.slice('--report-file='.length);
		}

		if (token.startsWith('-r=')) {
			return token.slice('-r='.length);
		}
	}

	return undefined;
}

function resolveReportPath(reportPath: string, validatedFilePath: string): string {
	if (path.isAbsolute(reportPath)) {
		return reportPath;
	}

	return path.resolve(path.dirname(validatedFilePath), reportPath);
}

function getEffectiveReportPath(filePath: string, validateArgs: string): string {
	const reportFromArgs = extractReportPathFromArgs(validateArgs);
	return reportFromArgs ? resolveReportPath(reportFromArgs, filePath) : getValidationReportPath(filePath);
}

function getValidateBinaryPath(): string {
	const configuredPath = vscode.workspace.getConfiguration('pds4-validate').get<string>('validateBinaryPath', '').trim();
	return configuredPath.length > 0 ? configuredPath : 'validate';
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function getLastArgs(context: vscode.ExtensionContext): string {
	return context.workspaceState.get<string>(LAST_ARGS_KEY, '');
}

function getRecentArgs(context: vscode.ExtensionContext): string[] {
	return context.workspaceState.get<string[]>(RECENT_ARGS_KEY, []);
}

async function storeArgs(context: vscode.ExtensionContext, args: string): Promise<void> {
	const trimmed = args.trim();
	await context.workspaceState.update(LAST_ARGS_KEY, trimmed);

	if (!trimmed) {
		return;
	}

	const recent = getRecentArgs(context).filter((entry) => entry !== trimmed);
	recent.unshift(trimmed);
	await context.workspaceState.update(RECENT_ARGS_KEY, recent.slice(0, MAX_RECENT_ARGS));
}

function getPresetFilePath(filePath: string): string | undefined {
	const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
	if (!folder) {
		return undefined;
	}

	return path.join(folder.uri.fsPath, '.vscode', PRESET_FILE_NAME);
}

function getPresetFilePathFromWorkspaceFolder(folder: vscode.WorkspaceFolder): string {
	return path.join(folder.uri.fsPath, '.vscode', PRESET_FILE_NAME);
}

function formatPresetFile(presets: WorkspacePreset[]): string {
	return `${JSON.stringify({ presets }, null, 2)}\n`;
}

async function saveWorkspacePresets(filePath: string, presets: WorkspacePreset[]): Promise<string | undefined> {
	const presetPath = getPresetFilePath(filePath);
	if (!presetPath) {
		return undefined;
	}

	await fs.mkdir(path.dirname(presetPath), { recursive: true });
	await fs.writeFile(presetPath, formatPresetFile(presets), 'utf8');

	return presetPath;
}

function getWorkspaceFolderForPresetCommands(): vscode.WorkspaceFolder | undefined {
	const editor = vscode.window.activeTextEditor;
	if (editor) {
		const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		if (folder) {
			return folder;
		}
	}

	const firstFolder = vscode.workspace.workspaceFolders?.[0];
	return firstFolder;
}

async function openPresetFileForWorkspace(folder: vscode.WorkspaceFolder): Promise<void> {
	const presetPath = getPresetFilePathFromWorkspaceFolder(folder);
	if (!(await fileExists(presetPath))) {
		await fs.mkdir(path.dirname(presetPath), { recursive: true });
		await fs.writeFile(presetPath, formatPresetFile(DEFAULT_WORKSPACE_PRESETS), 'utf8');
	}

	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(presetPath));
	await vscode.window.showTextDocument(document, { preview: false, preserveFocus: false });
}

async function loadWorkspacePresets(filePath: string, output: vscode.OutputChannel): Promise<WorkspacePreset[]> {
	const presetPath = getPresetFilePath(filePath);
	if (!presetPath) {
		return [];
	}

	try {
		const raw = await fs.readFile(presetPath, 'utf8');
		const parsed = JSON.parse(raw) as { presets?: Array<{ name?: unknown; args?: unknown }> };
		const presets = Array.isArray(parsed.presets) ? parsed.presets : [];

		return presets
			.filter((preset) => typeof preset.name === 'string' && typeof preset.args === 'string')
			.map((preset) => ({
				name: preset.name as string,
				args: (preset.args as string).trim()
			}));
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
			const message = error instanceof Error ? error.message : String(error);
			output.appendLine(`Failed to read presets from ${presetPath}: ${message}`);
		}
		return [];
	}
}

async function selectRunArgs(
	context: vscode.ExtensionContext,
	filePath: string,
	output: vscode.OutputChannel
): Promise<string | undefined> {
	const lastArgs = getLastArgs(context);
	const recentArgs = getRecentArgs(context);
	const presets = await loadWorkspacePresets(filePath, output);

	type RunArgPick = vscode.QuickPickItem & { value: string; mode: 'preset' | 'recent' | 'custom' | 'empty' };
	const picks: RunArgPick[] = [];

	picks.push({
		label: '$(edit) Enter custom arguments...',
		description: lastArgs ? `Last: ${lastArgs}` : 'No previous arguments',
		value: lastArgs,
		mode: 'custom'
	});
	picks.push({
		label: '$(circle-slash) Run with no extra arguments',
		description: 'Only validate <current-file>',
		value: '',
		mode: 'empty'
	});

	for (const preset of presets) {
		picks.push({
			label: `$(symbol-keyword) Preset: ${preset.name}`,
			description: preset.args,
			value: preset.args,
			mode: 'preset'
		});
	}

	for (const args of recentArgs) {
		picks.push({
			label: '$(history) Recent',
			description: args,
			value: args,
			mode: 'recent'
		});
	}

	const selected = await vscode.window.showQuickPick(picks, {
		placeHolder: 'Select validation arguments source'
	});

	if (!selected) {
		return undefined;
	}

	if (selected.mode === 'custom') {
		const entered = await vscode.window.showInputBox({
			prompt: 'Enter additional validate arguments (file path is appended automatically)',
			value: selected.value,
			placeHolder: '--recurse --max-errors 200'
		});
		if (entered === undefined) {
			return undefined;
		}
		return entered.trim();
	}

	return selected.value.trim();
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
	}

	return false;
}

async function runValidationInTerminal(
	context: vscode.ExtensionContext,
	terminal: vscode.Terminal,
	output: vscode.OutputChannel,
	filePath: string,
	diagnostics: vscode.DiagnosticCollection,
	validateBinaryPath: string,
	validateArgs: string
): Promise<void> {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pds4-validate-'));
	const errorFile = path.join(tempDir, 'validate-stderr.txt');
	const exitFile = path.join(tempDir, 'validate-exit.txt');
	const fileDir = path.dirname(filePath);
	const reportFromArgs = extractReportPathFromArgs(validateArgs);
	const reportPath = reportFromArgs ? resolveReportPath(reportFromArgs, filePath) : getValidationReportPath(filePath);
	const autoReportSegment = reportFromArgs ? '' : `--report-file ${quoteForShell(reportPath)} `;

	const quotedFilePath = quoteForShell(filePath);
	const quotedFileDir = quoteForShell(fileDir);
	const quotedValidateBinaryPath = quoteForShell(validateBinaryPath);
	const quotedErrorFile = quoteForShell(errorFile);
	const quotedExitFile = quoteForShell(exitFile);
	const argsSegment = validateArgs ? `${validateArgs} ` : '';
	const shellCommand = `cd ${quotedFileDir} && ${quotedValidateBinaryPath} ${argsSegment}${autoReportSegment}${quotedFilePath} 2> ${quotedErrorFile}; printf "%s" "$?" > ${quotedExitFile}`;

	const shownArgs = validateArgs ? ` ${validateArgs}` : '';
	output.appendLine(`Running in terminal: ${validateBinaryPath}${shownArgs} \"${filePath}\"`);
	output.appendLine(`Using validate report-file output: ${reportPath}`);
	terminal.sendText(shellCommand, true);

	const hasExitFile = await waitForFile(exitFile, 10 * 60 * 1000);
	if (!hasExitFile) {
		const timeoutMessage = 'Validation timed out while waiting for terminal completion marker.';
		output.appendLine(timeoutMessage);
		diagnostics.set(vscode.Uri.file(filePath), []);
		await context.workspaceState.update('pds4-validate.lastRun', {
			filePath,
			timestamp: new Date().toISOString(),
			exitCode: null,
			output: timeoutMessage
		});
		void vscode.window.showWarningMessage(timeoutMessage);
		return;
	}

	const [rawErrorOutput, exitText] = await Promise.all([
		fs.readFile(errorFile, 'utf8').catch(() => ''),
		fs.readFile(exitFile, 'utf8').catch(() => '')
	]);

	const parsedExit = Number.parseInt(exitText.trim(), 10);
	const exitCode = Number.isFinite(parsedExit) ? parsedExit : null;
	let effectiveOutput = '';
	try {
		effectiveOutput = await fs.readFile(reportPath, 'utf8');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		const stderrHint = rawErrorOutput.trim().length > 0 ? `\n\nStderr:\n${rawErrorOutput.trim()}` : '';
		effectiveOutput = `Validation did not produce a readable report file at ${reportPath}: ${message}${stderrHint}`;
		output.appendLine(`Could not read validate report file (${reportPath}): ${message}`);
	}

	if (exitCode === 1) {
		const failureMessage = 'Validation failed with exit code 1.';
		if (effectiveOutput.trim().length === 0) {
			effectiveOutput = rawErrorOutput.trim().length > 0 ? `${failureMessage}\n\nStderr:\n${rawErrorOutput.trim()}` : failureMessage;
		} else {
			effectiveOutput = `${failureMessage}\n\n${effectiveOutput}`;
		}
		output.appendLine(failureMessage);
	}

	await context.workspaceState.update('pds4-validate.lastRun', {
		filePath,
		reportPath,
		timestamp: new Date().toISOString(),
		exitCode,
		output: effectiveOutput
	});

	const reportContent = buildValidationReport(filePath, exitCode, effectiveOutput);
	await fs.writeFile(reportPath, reportContent, 'utf8');
	output.appendLine(`Saved validation report: ${reportPath}`);

	await updateDiagnosticsForFile(filePath, effectiveOutput, diagnostics, output);

	await showValidationReport(reportPath);

	if (exitCode === 0) {
		void vscode.window.showInformationMessage('Validation completed successfully.');
	} else {
		void vscode.window.showWarningMessage(`Validation finished with exit code ${exitCode}.`);
	}

	await Promise.all([
		fs.unlink(errorFile).catch(() => undefined),
		fs.unlink(exitFile).catch(() => undefined),
		fs.rmdir(tempDir).catch(() => undefined)
	]);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "pds4-validate" is now active!');

	const output = vscode.window.createOutputChannel('PDS4 Validate');
	context.subscriptions.push(output);
	const diagnostics = vscode.languages.createDiagnosticCollection('pds4-validate');
	context.subscriptions.push(diagnostics);
	const terminal = vscode.window.createTerminal('PDS4 Validate');
	context.subscriptions.push(terminal);
	let validationInProgress = false;
	let pendingCustomRerun: { filePath: string; validateArgs: string; validateBinaryPath: string } | undefined;

	const runValidation = (filePath: string, validateArgs: string, binaryOverride?: string) => {
		const validateBinaryPath = binaryOverride ?? getValidateBinaryPath();
		diagnostics.set(vscode.Uri.file(filePath), []);
		output.show(true);
		terminal.show(true);
		validationInProgress = true;
		void runValidationInTerminal(context, terminal, output, filePath, diagnostics, validateBinaryPath, validateArgs)
			.catch(async (error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				output.appendLine(`Validation failed: ${message}`);
				diagnostics.set(vscode.Uri.file(filePath), []);
				await context.workspaceState.update('pds4-validate.lastRun', {
					filePath,
					timestamp: new Date().toISOString(),
					exitCode: -1,
					output: `Validation failed: ${message}`
				});

				const selected = await vscode.window.showErrorMessage(
					'Validation failed. Choose a quick action to recover.',
					'Open Binary Setting',
					'Open Preset File',
					'Rerun With Custom Binary'
				);

				if (selected === 'Open Binary Setting') {
					await vscode.commands.executeCommand('workbench.action.openSettings', 'pds4-validate.validateBinaryPath');
				}

				if (selected === 'Open Preset File') {
					const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath)) ?? getWorkspaceFolderForPresetCommands();
					if (folder) {
						await openPresetFileForWorkspace(folder);
					}
				}

				if (selected === 'Rerun With Custom Binary') {
					const customBinaryPath = await vscode.window.showInputBox({
						prompt: 'Enter full path to the validate binary for a one-time rerun',
						value: validateBinaryPath
					});
					if (customBinaryPath && customBinaryPath.trim().length > 0) {
						pendingCustomRerun = {
							filePath,
							validateArgs,
							validateBinaryPath: customBinaryPath.trim()
						};
					}
				}
			})
			.finally(() => {
				validationInProgress = false;
				if (pendingCustomRerun) {
					const rerun = pendingCustomRerun;
					pendingCustomRerun = undefined;
					runValidation(rerun.filePath, rerun.validateArgs, rerun.validateBinaryPath);
				}
			});

		void vscode.window.showInformationMessage(`Started validation for ${path.basename(filePath)}.`);
	};

	const disposable = vscode.commands.registerCommand('pds4-validate.validateCurrentFile', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active file to validate.');
			return;
		}

		if (validationInProgress) {
			void vscode.window.showWarningMessage('Validation is already running. Please wait for it to finish.');
			return;
		}

		const filePath = editor.document.uri.fsPath;
		const args = getLastArgs(context);
		runValidation(filePath, args);
	});

	context.subscriptions.push(disposable);

	const runWithArgs = vscode.commands.registerCommand('pds4-validate.validateCurrentFileWithArguments', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			void vscode.window.showErrorMessage('No active file to validate.');
			return;
		}

		if (validationInProgress) {
			void vscode.window.showWarningMessage('Validation is already running. Please wait for it to finish.');
			return;
		}

		const filePath = editor.document.uri.fsPath;
		const selectedArgs = await selectRunArgs(context, filePath, output);
		if (selectedArgs === undefined) {
			return;
		}

		await storeArgs(context, selectedArgs);
		runValidation(filePath, selectedArgs);
	});

	const clearArgs = vscode.commands.registerCommand('pds4-validate.clearValidationArguments', async () => {
		await context.workspaceState.update(LAST_ARGS_KEY, '');
		await context.workspaceState.update(RECENT_ARGS_KEY, []);
		void vscode.window.showInformationMessage('Cleared validation arguments history.');
	});

	const editPreset = vscode.commands.registerCommand('pds4-validate.editValidationPreset', async () => {
		const folder = getWorkspaceFolderForPresetCommands();
		if (!folder) {
			void vscode.window.showErrorMessage('Open a workspace folder to manage presets.');
			return;
		}

		const filePath = path.join(folder.uri.fsPath, 'placeholder.xml');
		const presetPath = getPresetFilePathFromWorkspaceFolder(folder);
		if (!(await fileExists(presetPath))) {
			await saveWorkspacePresets(filePath, DEFAULT_WORKSPACE_PRESETS);
		}

		const presets = await loadWorkspacePresets(filePath, output);
		if (presets.length === 0) {
			void vscode.window.showInformationMessage('No presets found to edit.');
			return;
		}

		const selected = await vscode.window.showQuickPick(
			presets.map((preset) => ({ label: preset.name, description: preset.args, preset })),
			{ placeHolder: 'Select preset to edit' }
		);
		if (!selected) {
			return;
		}

		const nextName = await vscode.window.showInputBox({ prompt: 'Preset name', value: selected.preset.name });
		if (!nextName || nextName.trim().length === 0) {
			return;
		}

		const nextArgs = await vscode.window.showInputBox({ prompt: 'Preset arguments', value: selected.preset.args });
		if (nextArgs === undefined) {
			return;
		}

		const updated = presets.map((preset) => {
			if (preset.name === selected.preset.name && preset.args === selected.preset.args) {
				return { name: nextName.trim(), args: nextArgs.trim() };
			}
			return preset;
		});

		await saveWorkspacePresets(filePath, updated);
		void vscode.window.showInformationMessage(`Updated preset '${nextName.trim()}'.`);
	});

	context.subscriptions.push(runWithArgs, clearArgs, editPreset);
}

// This method is called when your extension is deactivated
export function deactivate() {}
