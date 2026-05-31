Use Visual Studio code to run the PDS [validate](https://github.com/nasa-pds/validate) tool on the
currently open file and have the diagnostics (WARNINGs, ERRORs) displayed in the editor.

![](https://github.com/maxmahlke/pds4-validate-vscode/blob/main/doc/showcase.png?raw=true)

- Runs validation asynchronously without blocking the editor
- Keep a persistent report file next to the validated product
- No contetx switching: Displays warning and error messages directly in the Problems panel and in-file diagnostics
- Supports run-time argument changes and reusable workspace presets

## What The Extension Does

When validation is started, the extension:

1. Runs validate on the current file in a dedicated VS Code terminal.
2. Saves a report file named:

	 `validate_<base file name>.txt`

	 Example:
	 - Input file: `bundle_foo.xml`
	 - Report file: `validate_bundle_foo.txt`

	 If your selected arguments already include `--report-file` or `-r`, that report path is used instead.

3. Parses WARNING and ERROR lines from validate output.
4. Ingests those as VS Code diagnostics on the validated file.

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

3. Edit Validation Preset - PDS4
	 - Creates the preset file if it does not exist yet.
	 - Lets you select an existing preset and update name/args.

## Configuration

The extension adds one VS Code setting:

1. pds4-validate.validateBinaryPath
	 - Type: string
	 - Default: empty
	 - Behavior:
		 - If set: uses this exact binary path.
		 - If empty: uses validate resolved from PATH.

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

## Report File Handling

The extension always uses validate's report-file output for the report.

The extension handles this by:

1. Detecting report-file arguments in common forms:
	 - --report-file value
	 - --report-file=value
	 - -r value
	 - -r=value
2. Preferring the user-provided report path when one is already present.
3. Otherwise adding `--report-file validate_<base>.txt` automatically.
4. Reading diagnostics and report contents from that report file.

## Requirements

You must have the PDS validate tool available either:

1. On PATH as validate, or
2. Via pds4-validate.validateBinaryPath setting.
