Use Visual Studio code to uun the PDS [validate]https://github.com/nasa-pds/validate) tool on the
currently open file and inspect the results without leaving the editor.

- Runs validation asynchronously without blocking the editor
- Keep a persistent report file next to the validated product
- Surface warning and error messages directly in the Problems panel and in-file diagnostics - no context switching
- Supports run-time argument changes and reusable workspace presets

## What The Extension Does

When validation is started, the extension:

1. Runs validate on the current file in a dedicated VS Code terminal.
2. Always runs validate with a target report file and records the exit code.
3. Saves a report file named:

	 `validate_<base file name>.txt`

	 Example:
	 - Input file: `bundle_foo.xml`
	 - Report file: `validate_bundle_foo.txt`

	 If your selected arguments already include `--target` or `-t`, that target path is used instead.

4. Parses WARNING and ERROR lines from validate output.
5. Ingests those as VS Code diagnostics on the validated file.
6. Opens the saved report file in the background (does not steal focus).

## Commands (User Interface)

Open Command Palette and run:

1. Validate Current File - PDS4
	 - Runs validation on the active file.
	 - Uses the last selected extra arguments (if any).

2. Validate Current File With Arguments - PDS4
	 - Opens a selection flow to choose arguments:
		 - Enter custom arguments
		 - Run with no extra arguments
		 - Pick from workspace presets
		 - Pick from recent argument history
	 - Saves selected args as last-used args.

3. Clear Validation Arguments History - PDS4
	 - Clears last-used and recent argument history stored by the extension.

4. Edit Validation Preset - PDS4
	 - Creates the preset file if it does not exist yet.
	 - Lets you select an existing preset and update name/args.

5. Compare Current And Previous Validation Report - PDS4
	 - Opens a diff view between:
		 - Current report: the most recent target report file
		 - Previous report: `.previous_validate_report.txt`

## Configuration

The extension contributes one VS Code setting:

1. pds4-validate.validateBinaryPath
	 - Type: string
	 - Default: empty
	 - Behavior:
		 - If set: uses this exact binary path.
		 - If empty: uses validate resolved from PATH.

## Runtime Arguments And Presets

Because validation flags can change frequently during the day, argument
selection is run-time driven (not a static settings-only workflow).

### Last-used and recent args

- Last-used args are automatically reused by Validate Current File - PDS4.
- Recent args are available in the With Arguments command picker.

### Workspace preset file

You can define shared presets in:

- .vscode/pds4-validate.json

When the file is first created, it contains this default preset:

Format:

```json
{
	"presets": [
		{
			"name": "Config File",
			"args": "-c config.txt"
		}
	]
}
```

These presets appear in the With Arguments quick picker.

You can update the preset file through Edit Validation Preset - PDS4.

## Diagnostics And Problems Integration

The extension scans validate output lines formatted like WARNING or ERROR messages and creates diagnostics in the active file.

This gives you:

- Highlights in the editor gutter/squiggles.
- Entries in the Problems view.
- Click-to-jump navigation to referenced lines.

## Target Output Handling

The extension always uses validate's target-file output for the report.

The extension handles this by:

1. Detecting target arguments in common forms:
	 - --target value
	 - --target=value
	 - -t value
	 - -t=value
2. Preferring the user-provided target path when one is already present.
3. Otherwise adding `--target validate_<base>.txt` automatically.
4. Reading diagnostics and report contents from that target file.

## Report History And Comparison

On each run, the extension keeps the last report as a previous snapshot before writing the new report.

- Current report: the active target report path for the last run
- Previous report: .previous_validate_report.txt

Use Compare Current And Previous Validation Report - PDS4 to open a diff between both files.

## Requirements

You must have the PDS validate tool available either:

1. On PATH as validate, or
2. Via pds4-validate.validateBinaryPath setting.