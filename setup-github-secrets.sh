#!/bin/bash

# Script to set up GitHub secrets for Sales Chan
# You need to have GitHub CLI (gh) installed and authenticated

echo "Setting up GitHub secrets for Sales Chan..."
echo "==========================================="

# Get the repository name
REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')
echo "Repository: $REPO"

# Load .env file
if [ ! -f .env ]; then
    echo "Error: .env file not found!"
    exit 1
fi

# Function to set a secret
set_secret() {
    local key=$1
    local value=$2
    echo "Setting $key..."
    echo "$value" | gh secret set "$key" -R "$REPO"
}

# Extract values from .env and set as GitHub secrets
SALES_BOT_TOKEN=$(grep "^SALES_BOT_TOKEN=" .env | cut -d'=' -f2- | sed 's/^"\(.*\)"$/\1/')
SALES_CHANNEL_ID="C06KMG8TZS7"  # The channel you specified
SALES_LIST_ID=$(grep "^SALES_LIST_ID=" .env | cut -d'=' -f2- | sed 's/^"\(.*\)"$/\1/')
GOOGLE_API_KEY=$(grep "^GOOGLE_API_KEY=" .env | cut -d'=' -f2- | sed 's/^"\(.*\)"$/\1/')
GOOGLE_MODEL=$(grep "^GOOGLE_MODEL=" .env | cut -d'=' -f2- | sed 's/^"\(.*\)"$/\1/')

# Set the secrets
set_secret "SALES_BOT_TOKEN" "$SALES_BOT_TOKEN"
set_secret "SALES_CHANNEL_ID" "$SALES_CHANNEL_ID"
set_secret "SALES_LIST_ID" "$SALES_LIST_ID"
set_secret "GOOGLE_API_KEY" "$GOOGLE_API_KEY"
set_secret "GOOGLE_MODEL" "$GOOGLE_MODEL"

echo ""
echo "GitHub secrets have been set!"
echo ""
echo "You can verify them at:"
echo "https://github.com/$REPO/settings/secrets/actions"
echo ""
echo "The Sales Chan Daily Update will run at 8:00 AM JST Monday-Friday"
echo "You can also trigger it manually from the Actions tab"