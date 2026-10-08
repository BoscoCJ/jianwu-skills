# Clash Google Rules Extractor

Extract and consolidate Google-related rules into a dedicated "Google专用" proxy group from a Clash backup configuration.

## Usage

```
/clash-google-rules-extractor <backup_file> [output_file]
```

### Arguments

- `backup_file`: Path to the Clash backup YAML file (e.g., `D:\Data\clash-backup-20261008.yaml`)
- `output_file`: (Optional) Output path. If not specified, generates `clash-google-YYYYMMDD.yaml` in the same directory

### Examples

```
/clash-google-rules-extractor D:\Data\clash-backup-20261008.yaml
/clash-google-rules-extractor D:\Data\clash-backup-20261008.yaml D:\Data\custom-output.yaml
```

## What this does

1. Reads the input Clash backup file
2. Extracts the "🧲 海外AI" proxy group's node list
3. Creates a new "🌐 Google专用" proxy group with the same nodes
4. Applies all predefined Google-related rules (from `google-rules.yaml`)
5. Outputs a complete configuration file ready to use

## Key Features

- **Fixed Rules**: All Google-related domain rules are predefined and consistent
- **Auto Node Sync**: Automatically uses the latest node list from "海外AI" group
- **Minimal Changes**: Original configuration structure preserved, only Google rules extracted
- **Idempotent**: Safe to run multiple times on the same backup

## Configuration

Rules are defined in two separate files:

- **`google-rules.yaml`**: Google-related domain rules (AI products, APIs, etc.)
- **`custom-rules.yaml`**: Custom rules (local direct connections, ad blocking, domestic services, etc.)

To add or modify rules, edit the corresponding YAML file.

## Notes

- The "🌐 Google专用" group is inserted right after "🧲 海外AI"
- Original backup file is never modified
- Output file includes:
  - All original configuration from backup
  - New "🌐 Google专用" proxy group and rules
  - All custom rules from `custom-rules.yaml`
- Rules are applied in order: custom rules first, then Google rules, then original rules
