#!/bin/bash
# Add JSON file to .env as an environment variable
# Usage: ./add-json-to-env.sh <json-file-path> <env-variable-name>
# Example: ./add-json-to-env.sh ./ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON

# Check if the correct number of arguments are provided
if [ "$#" -ne 2 ]; then
    echo "Usage: ./add-json-to-env.sh <json-file-path> <env-variable-name>"
    echo "Example: ./add-json-to-env.sh ./ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON"
    exit 1
fi

JSON_FILE_PATH="$1"
ENV_VAR_NAME="$2"
ENV_FILE="./.env"

# Check if the JSON file exists
if [ ! -f "$JSON_FILE_PATH" ]; then
    echo "Error: File '$JSON_FILE_PATH' does not exist."
    exit 1
fi

# Check if the .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Validate JSON file and convert to compact format
if ! COMPACT_JSON=$(cat "$JSON_FILE_PATH" | jq -c .); then
    echo "Error: Invalid JSON file."
    exit 1
fi

# Escape quotes for sed command
ESCAPED_JSON=$(echo "$COMPACT_JSON" | sed 's/"/\\"/g')

# Check if the variable already exists in the .env file
if grep -q "^$ENV_VAR_NAME=" "$ENV_FILE"; then
    # Replace the existing variable
    sed -i.bak "s/^$ENV_VAR_NAME=.*/$ENV_VAR_NAME=$ESCAPED_JSON/" "$ENV_FILE"
    rm "${ENV_FILE}.bak" # Remove the backup file
    echo "Updated existing $ENV_VAR_NAME in .env file."
else
    # Append the new variable
    echo "$ENV_VAR_NAME=$COMPACT_JSON" >> "$ENV_FILE"
    echo "Added $ENV_VAR_NAME to .env file."
fi

echo "Success! You can now remove the original JSON file for better security."
echo "Run: rm $JSON_FILE_PATH"
