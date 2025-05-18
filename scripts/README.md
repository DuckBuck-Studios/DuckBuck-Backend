# DuckBuck Backend - Environment Scripts

This directory contains utility scripts for managing environment variables and configuration.

## Script List

### 1. `add-json-to-env.sh` (macOS/Linux)

Adds the contents of a JSON file to your `.env` file as a variable.

**Usage:**
```bash
./add-json-to-env.sh <json-file-path> <env-variable-name>
```

**Example:**
```bash
./add-json-to-env.sh ./ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON
```

**Requirements:**
- `jq` command line tool must be installed
  - Install on macOS: `brew install jq`
  - Install on Linux: `apt-get install jq` or `yum install jq`

### 2. `add-json-to-env.bat` (Windows)

Windows version of the script to add JSON file contents to your `.env` file.

**Usage:**
```cmd
add-json-to-env.bat <json-file-path> <env-variable-name>
```

**Example:**
```cmd
add-json-to-env.bat .\ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON
```

**Requirements:**
- `jq` command line tool must be installed
  - Download from: https://stedolan.github.io/jq/download/
  - Add to your PATH

## Why Use These Scripts?

These scripts help with:

1. **Security**: Keep sensitive credentials in your `.env` file instead of separate files
2. **Simplification**: Easier deployment with all configuration in one file
3. **Best Practice**: Avoid committing credential files to version control

After using these scripts to add credentials to your `.env` file, you can safely delete the original JSON files.

## Troubleshooting

If you encounter issues:

1. Make sure `jq` is installed and accessible from your PATH
2. Verify that you have write permissions to your `.env` file
3. Check that the JSON file is valid and properly formatted

For more information about environment variable security, see `../docs/ENV-SECURITY.md`
