#!/bin/bash

echo "🚀 Deploying Research-chan Bot to Heroku..."

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Please install it first."
    exit 1
fi

# Check if logged in to Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo "❌ Not logged in to Heroku. Please run 'heroku login' first."
    exit 1
fi

# Initialize git if not already
if [ ! -d .git ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit"
fi

# Check if Heroku app exists
APP_NAME="ikhor-slack-bots"
if ! heroku apps:info --app $APP_NAME &> /dev/null; then
    echo "📱 Creating Heroku app: $APP_NAME..."
    heroku create $APP_NAME
else
    echo "✅ Using existing app: $APP_NAME"
fi

# Add Heroku remote if not exists
if ! git remote | grep heroku &> /dev/null; then
    echo "🔗 Adding Heroku remote..."
    heroku git:remote -a $APP_NAME
fi

# Read .env file and set config vars
if [ -f .env ]; then
    echo "⚙️  Setting environment variables from .env..."
    
    # Parse .env file and set config vars as-is
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ -z "$key" ]] || [[ "$key" =~ ^# ]]; then
            continue
        fi
        # Remove quotes from value if present
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        # Set on Heroku with identical key
        heroku config:set "$key"="$value" --app $APP_NAME
    done < .env
    
    echo "✅ Environment variables configured"
else
    echo "⚠️  No .env file found. Make sure to set config vars manually."
fi

# Deploy to Heroku
echo "📤 Deploying to Heroku..."
git add .
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || true
git push heroku main

# Check if deployment was successful
if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    
    # Show logs
    echo "📋 Recent logs:"
    heroku logs --tail -n 20 --app $APP_NAME
    
    # Check if scheduler addon exists
    if ! heroku addons --app $APP_NAME | grep scheduler &> /dev/null; then
        echo "⏰ Adding Heroku Scheduler..."
        heroku addons:create scheduler:standard --app $APP_NAME
        echo "📝 Remember to configure the scheduler:"
        echo "   heroku addons:open scheduler --app $APP_NAME"
        echo "   Set it to run: node index.mjs"
        echo "   At your preferred time (times are in UTC)"
    else
        echo "✅ Scheduler addon already configured"
    fi
    
    echo ""
    echo "🎉 Deployment complete!"
    echo "📌 Next steps:"
    echo "   1. Test manually: heroku run node index.mjs --app $APP_NAME"
    echo "   2. Configure scheduler: heroku addons:open scheduler --app $APP_NAME"
    echo "   3. Monitor logs: heroku logs --tail --app $APP_NAME"
else
    echo "❌ Deployment failed. Check the errors above."
    exit 1
fi
