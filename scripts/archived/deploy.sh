#!/bin/bash
# CAC Admin Bot Deployment Script
# This script handles the full deployment process with clear feedback

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_error() {
    echo -e "${RED}[!]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Check if running as root (required for systemctl)
if [ "$EUID" -ne 0 ]; then
    print_error "This script must be run as root (for systemctl commands)"
    exit 1
fi

print_status "Starting CAC Admin Bot deployment..."

# Step 1: Build the project
print_status "Building TypeScript project..."
if yarn build:clean; then
    print_status "Build completed successfully"
else
    print_error "Build failed! Check TypeScript errors above."
    exit 1
fi

# Step 2: Run post-build validation
print_status "Validating build output..."
if yarn validate:postbuild; then
    print_status "Build validation passed"
else
    print_error "Build validation failed! The bot was not built correctly."
    exit 1
fi

# Step 3: Restart the systemd service
print_status "Restarting cacmin-bot service..."
if systemctl restart cacmin-bot; then
    print_status "Service restart command issued"
else
    print_error "Failed to restart service"
    exit 1
fi

# Step 4: Wait for service to stabilize
print_status "Waiting for service to stabilize..."
sleep 3

# Step 5: Check service status
print_status "Checking service status..."
if systemctl is-active --quiet cacmin-bot; then
    print_status "Service is running!"

    # Show recent logs
    print_status "Recent service logs:"
    journalctl -u cacmin-bot -n 20 --no-pager

    echo ""
    print_status "Deployment completed successfully!"
else
    print_error "Service failed to start!"

    # Show error logs
    print_error "Service logs:"
    journalctl -u cacmin-bot -n 50 --no-pager

    exit 1
fi