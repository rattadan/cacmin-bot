#!/bin/bash
# Complete Clean and Rebuild Script for CAC Admin Bot
# This removes all build artifacts and dependencies, then rebuilds from scratch

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_error() {
    echo -e "${RED}[!]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Complete Clean Rebuild Process${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Step 1: Stop the service
print_status "Stopping cacmin-bot service..."
systemctl stop cacmin-bot || print_warning "Service was not running"

# Step 2: Save important files
print_status "Backing up configuration files..."
if [ -f .env ]; then
    cp .env .env.backup
    print_status ".env file backed up"
fi

if [ -f ./data/bot.db ]; then
    cp ./data/bot.db ./data/bot.db.backup
    print_status "Database backed up"
fi

# Step 3: Clean everything
print_status "Removing build artifacts and dependencies..."
rm -rf node_modules && print_status "Removed node_modules"
rm -rf dist && print_status "Removed dist"
rm -rf .yarn && print_status "Removed .yarn cache"
rm -rf .cache && print_status "Removed .cache"
rm -f yarn.lock && print_status "Removed yarn.lock"
rm -f package-lock.json && print_status "Removed package-lock.json"
rm -f yarn-error.log && print_status "Removed yarn-error.log"
rm -rf logs/*.log && print_status "Cleaned log files"

# Step 4: Clear package manager caches
print_status "Clearing yarn cache..."
yarn cache clean

# Step 5: Git pull latest changes (optional)
read -p "Pull latest changes from git? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Pulling latest changes..."
    git pull
fi

# Step 6: Restore configuration
print_status "Restoring configuration files..."
if [ -f .env.backup ]; then
    cp .env.backup .env
    print_status ".env file restored"
fi

# Step 7: Fresh install
print_status "Installing fresh dependencies..."
yarn install

# Step 8: Build the project
print_status "Building TypeScript project..."
yarn build:clean

# Step 9: Validate build
print_status "Validating build..."
if yarn validate:postbuild; then
    print_status "Build validation passed"
else
    print_error "Build validation failed!"
    exit 1
fi

# Step 10: Restart service
print_status "Restarting cacmin-bot service..."
systemctl restart cacmin-bot

# Wait for service to start
sleep 3

# Step 11: Check status
print_status "Checking service status..."
if systemctl is-active --quiet cacmin-bot; then
    print_status "Service is running!"
    echo ""
    echo "Service Status:"
    systemctl status cacmin-bot --no-pager | head -10
    echo ""
    echo "Recent Logs:"
    journalctl -u cacmin-bot -n 20 --no-pager
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Clean rebuild completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    print_error "Service failed to start!"
    echo "Error logs:"
    journalctl -u cacmin-bot -n 50 --no-pager
    exit 1
fi