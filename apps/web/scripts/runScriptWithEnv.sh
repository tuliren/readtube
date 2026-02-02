#!/bin/bash

# Check the first argument for environment selection
ENV_CHOICE="$1"
ENV_FILE=".env.$ENV_CHOICE"

if [[ "$ENV_CHOICE" != "local" && "$ENV_CHOICE" != "production" && "$ENV_CHOICE" != "development" ]]; then
  echo "Error: The first argument must be one of 'local', 'production', or 'development'."
  exit 1
fi

shift  # Shift arguments to process any remaining options

CMD="npx tsx"

# Safety check for running in production
if [[ $ENV_CHOICE == "production" ]]; then
  while true; do
    read -p "Are you sure you want to run a production script? (Y/N): " REPLY
    case $REPLY in
        [Yy]* ) break;;
        [Nn]* ) exit 0;;
        * ) echo "Please answer Y or N.";;
    esac
  done
fi

# Check for .env file and throw error if it does not exist
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: Environment file ${ENV_FILE} does not exist."
  exit 1
else
  export SCRIPT_ENV="$ENV_CHOICE"
  FULL_COMMAND="DOTENV_CONFIG_PATH=$ENV_FILE $CMD -r dotenv/config -r tsconfig-paths/register $@"
  echo "Running: $FULL_COMMAND"
  eval $FULL_COMMAND
fi
