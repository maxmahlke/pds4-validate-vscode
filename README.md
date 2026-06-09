# pds4-validate-vscode

<p align="center">
  <a href="https://github.com/maxmahlke/pds4-validate-vscode#features"> Features </a> - <a href="https://github.com/maxmahlke/pds4-validate-vscode#install"> Install </a> - <a href="https://github.com/maxmahlke/pds4-validate-vscode#usage"> Usage - <a href="https://github.com/maxmahlke/pds4-validate-vscode#configuration"> Configuration </a>
</p>


Use Visual Studio code to run PDS [validate](https://github.com/nasa-pds/validate) on the
currently open file and display the diagnostics in the editor.

## Features

![](https://github.com/maxmahlke/pds4-validate-vscode/blob/main/doc/showcase.png?raw=true)

- Runs validation asynchronously without blocking the editor
- Keep a persistent report file next to the validated product
- Displays warning and error messages directly in the Problems panel and in-file diagnostics
- Supports run-time argument changes and reusable workspace presets

## Install

For macOS users, this is the recommended setup flow.

1. Install prerequisites.

```bash
# Install Homebrew (if not installed): https://brew.sh
brew install node git
```

`node` includes `npm`, so no separate `npm` package is required.

2. Clone the repository and enter the project folder.

```bash
git clone https://github.com/maxmahlke/pds4-validate-vscode.git
cd pds4-validate-vscode
```

3. Install project dependencies and the VS Code packaging tool.

```bash
npm install
npm install -g @vscode/vsce
```

4. Package the extension as a VSIX file.

```bash
vsce package
```

5. In VS Code, run `Extensions: Install from VSIX...` from the Command Palette and select the generated `.vsix` file.

6. Ensure the PDS `validate` CLI is available.

Either:
- install/provide `validate` on your `PATH`, or
- set `pds4-validate.validateBinaryPath` in VS Code to the full path of the `validate` binary.

Quick check:

```bash
validate --help
```

If this command fails, configure `pds4-validate.validateBinaryPath` before running the extension.

If your shell still cannot find `validate` after installation, restart VS Code so it picks up updated `PATH` settings.

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

The extension always uses validate's report-file output for the report. If a report-file is defined via the `-r|--report-file` arguments,
this file is used. Else, the extension uses `--report-file validate_<base>.txt` automatically, where `<base>` is the basename of the validated file.
