@echo off
REM Add JSON file to .env as an environment variable
REM Usage: add-json-to-env.bat <json-file-path> <env-variable-name>
REM Example: add-json-to-env.bat .\ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON

SETLOCAL EnableDelayedExpansion

REM Check if the correct number of arguments are provided
IF "%~2"=="" (
    echo Usage: add-json-to-env.bat ^<json-file-path^> ^<env-variable-name^>
    echo Example: add-json-to-env.bat .\ServiceAccountKey.json FIREBASE_SERVICE_ACCOUNT_JSON
    EXIT /B 1
)

SET JSON_FILE_PATH=%~1
SET ENV_VAR_NAME=%~2
SET ENV_FILE=.\.env

REM Check if the JSON file exists
IF NOT EXIST "%JSON_FILE_PATH%" (
    echo Error: File '%JSON_FILE_PATH%' does not exist.
    EXIT /B 1
)

REM Check if the .env file exists
IF NOT EXIST "%ENV_FILE%" (
    echo Error: .env file not found at %ENV_FILE%
    EXIT /B 1
)

REM Install required tools if not present
WHERE jq >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo jq is required to process JSON files but is not installed.
    echo Please install jq from: https://stedolan.github.io/jq/download/
    echo After installing, add it to your PATH and run this script again.
    EXIT /B 1
)

REM Read and validate the JSON file
FOR /F "delims=" %%i IN ('jq -c . "%JSON_FILE_PATH%"') DO SET COMPACT_JSON=%%i

IF "!COMPACT_JSON!"=="" (
    echo Error: Invalid JSON file or jq failed to process it.
    EXIT /B 1
)

REM Create a temporary file
SET TEMP_ENV_FILE=%TEMP%\temp_env_%RANDOM%.tmp
TYPE nul > "%TEMP_ENV_FILE%"
SET VARIABLE_EXISTS=0

REM Check if the variable already exists and create an updated .env file
FOR /F "usebackq tokens=*" %%a IN ("%ENV_FILE%") DO (
    SET line=%%a
    IF "!line:~0,%ENV_VAR_NAME%=!"=="!ENV_VAR_NAME!=" (
        echo %ENV_VAR_NAME%=!COMPACT_JSON! >> "%TEMP_ENV_FILE%"
        SET VARIABLE_EXISTS=1
    ) ELSE (
        echo !line! >> "%TEMP_ENV_FILE%"
    )
)

REM If variable doesn't exist, append it
IF %VARIABLE_EXISTS%==0 (
    echo %ENV_VAR_NAME%=!COMPACT_JSON! >> "%TEMP_ENV_FILE%"
    echo Added %ENV_VAR_NAME% to .env file.
) ELSE (
    echo Updated existing %ENV_VAR_NAME% in .env file.
)

REM Replace the original .env file
COPY /Y "%TEMP_ENV_FILE%" "%ENV_FILE%" > nul
DEL "%TEMP_ENV_FILE%"

echo Success! You can now remove the original JSON file for better security.
echo Run: del "%JSON_FILE_PATH%"

ENDLOCAL
