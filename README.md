# pds4-validate-vscode

<p align="center">
  <a href="https://github.com/maxmahlke/pds4-validate-vscode#features"> Features </a> - <a href="https://github.com/maxmahlke/pds4-validate-vscode#install"> Install </a> - <a href="https://github.com/maxmahlke/pds4-validate-vscode#usage"> Usage - <a href="https://github.com/maxmahlke/pds4-validate-vscode#configuration"> Configuration </a>
</p>


Use Visual Studio code to run the PDS [validate](https://github.com/nasa-pds/validate) tool on the
currently open file and have the diagnostics displayed in the editor.

## Features

![](https://github.com/maxmahlke/pds4-validate-vscode/blob/main/doc/showcase.png?raw=true)

- Runs validation asynchronously without blocking the editor
- Keep a persistent report file next to the validated product
- Displays warning and error messages directly in the Problems panel and in-file diagnostics
- Supports run-time argument changes and reusable workspace presets

## Install

1. Clone the repository and enter the project folder.

```bash
git clone https://github.com/maxmahlke/pds4-validate-vscode.git
cd pds4-validate-vscode
```

2. Install `vsce` (if you do not already have it).

```bash
npm install -g @vscode/vsce
```

3. Package the extension as a VSIX file.

```bash
vsce package
```

4. In VS Code, run `Extensions: Install from VSIX...` from the Command Palette and select the generated `.vsix` file.

Note: You must have the PDS validate tool available either on `PATH` as `validate`, or via `pds4-validate.validateBinaryPath` setting.

## Usage

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

These presets appear in the With Arguments quick picker. You can update the preset file through Edit Validation Preset - PDS4.

### Report File Handling

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
