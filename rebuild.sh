#!/bin/bash
# CAC Admin Bot - Unified Rebuild & Launch Script
# Cleans, rebuilds, and launches the bot with various options
#
# Usage:
#   ./rebuild.sh          # Default: clean, rebuild, and restart service
#   ./rebuild.sh --dev    # Clean, rebuild, and run in development mode
#   ./rebuild.sh --quick  # Skip clean, just rebuild and restart
#   ./rebuild.sh --full   # Full clean including cache, then rebuild and restart

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BRIGHT='\033[1m'
NC='\033[0m'

# Service name
SERVICE="cacmin-bot"

# Parse arguments
MODE="default"
SKIP_CLEAN=false
FULL_CLEAN=false

for arg in "$@"; do
    case $arg in
        --dev)
            MODE="dev"
            shift
            ;;
        --quick)
            SKIP_CLEAN=true
            shift
            ;;
        --full)
            FULL_CLEAN=true
            shift
            ;;
        --help|-h)
            echo -e "${BRIGHT}CAC Admin Bot - Rebuild & Launch Script${NC}"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dev     Clean, rebuild, and run in development mode"
            echo "  --quick   Skip cleaning, just rebuild and restart"
            echo "  --full    Full clean (including cache), rebuild, and restart"
            echo "  --help    Show this help message"
            echo ""
            echo "Default behavior: Clean build artifacts, rebuild, and restart service"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $arg${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Functions
print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_error() {
    echo -e "${RED}[!]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_header() {
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}   CAC Admin Bot - Rebuild & Launch${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
    echo ""
}

check_root_for_service() {
    if [ "$MODE" != "dev" ] && [ "$EUID" -ne 0 ]; then
        print_error "This script requires root privileges to manage systemd service"
        echo "Please run with: sudo $0 $@"
        exit 1
    fi
}

backup_important_files() {
    print_status "Backing up important files..."

    if [ -f .env ]; then
        cp .env .env.backup
        print_status "Backed up .env → .env.backup"
    fi

    if [ -f ./data/bot.db ]; then
        mkdir -p ./data
        cp ./data/bot.db ./data/bot.db.backup
        print_status "Backed up database → bot.db.backup"
    fi
}

restore_important_files() {
    if [ -f .env.backup ] && [ ! -f .env ]; then
        cp .env.backup .env
        print_status "Restored .env from backup"
    fi
}

clean_build_artifacts() {
    print_status "Cleaning build artifacts..."
    rm -rf dist && print_status "Removed dist/"
    rm -f yarn-error.log && print_status "Removed yarn-error.log"
    rm -rf logs/*.log && print_status "Cleaned log files"
}

full_clean() {
    print_status "Performing full clean..."

    # Clean build artifacts
    clean_build_artifacts

    # Clean dependencies and caches
    rm -rf node_modules && print_status "Removed node_modules/"
    rm -rf .yarn && print_status "Removed .yarn cache"
    rm -rf .cache && print_status "Removed .cache"
    rm -f yarn.lock && print_status "Removed yarn.lock"
    rm -f package-lock.json && print_status "Removed package-lock.json"

    # Clear package manager caches
    print_status "Clearing yarn cache..."
    yarn cache clean 2>/dev/null || npm cache clean --force 2>/dev/null || true
}

install_dependencies() {
    print_status "Installing dependencies..."

    # Check if package manager is installed
    if command -v yarn &> /dev/null; then
        yarn install
    elif command -v npm &> /dev/null; then
        npm install
    else
        print_error "No package manager found! Install yarn or npm first."
        exit 1
    fi
}

build_project() {
    print_status "Building TypeScript project..."

    if command -v yarn &> /dev/null; then
        yarn build
    else
        npm run build
    fi

    print_status "Build completed successfully"
}

validate_build() {
    print_status "Validating build..."

    # Check if dist/bot.js exists
    if [ ! -f dist/bot.js ]; then
        print_error "Build validation failed: dist/bot.js not found"
        return 1
    fi

    # Run validation script if it exists
    if command -v yarn &> /dev/null; then
        yarn validate:postbuild 2>/dev/null || true
    else
        npm run validate:postbuild 2>/dev/null || true
    fi

    print_status "Build validation passed"
}

stop_service() {
    if [ "$MODE" != "dev" ]; then
        print_status "Stopping $SERVICE service..."
        systemctl stop $SERVICE 2>/dev/null || print_warning "Service was not running"
    fi
}

start_service() {
    print_status "Starting $SERVICE service..."
    systemctl restart $SERVICE

    # Wait for service to stabilize
    sleep 3

    # Check if service is running
    if systemctl is-active --quiet $SERVICE; then
        print_status "Service started successfully!"
        echo ""
        echo -e "${GREEN}Service Status:${NC}"
        systemctl status $SERVICE --no-pager | head -n 10
    else
        print_error "Service failed to start!"
        echo ""
        echo -e "${RED}Error logs:${NC}"
        journalctl -u $SERVICE -n 50 --no-pager
        exit 1
    fi
}

run_dev_mode() {
    print_status "Starting bot in development mode..."
    echo ""
    echo -e "${YELLOW}Development mode - Press Ctrl+C to stop${NC}"
    echo ""

    if command -v yarn &> /dev/null; then
        yarn dev
    else
        npm run dev
    fi
}

show_logs() {
    echo ""
    echo -e "${GREEN}Recent logs:${NC}"
    journalctl -u $SERVICE -n 20 --no-pager 2>/dev/null || true
    echo ""
    echo -e "${BRIGHT}To follow logs: journalctl -u $SERVICE -f${NC}"
}

# Main execution
print_header

# Check for root if needed
if [ "$MODE" != "dev" ]; then
    check_root_for_service
fi

# Step 1: Stop service if running (except in dev mode)
if [ "$MODE" != "dev" ]; then
    stop_service
fi

# Step 2: Backup important files
backup_important_files

# Step 3: Clean based on options
if [ "$SKIP_CLEAN" = false ]; then
    if [ "$FULL_CLEAN" = true ]; then
        full_clean
    else
        clean_build_artifacts
    fi
fi

# Step 4: Install dependencies if needed
if [ "$FULL_CLEAN" = true ] || [ ! -d node_modules ]; then
    install_dependencies
fi

# Step 5: Restore configuration
restore_important_files

# Step 6: Build the project
build_project

# Step 7: Validate build
validate_build

# Step 8: Launch based on mode
if [ "$MODE" = "dev" ]; then
    run_dev_mode
else
    start_service
    show_logs
fi

# Success message
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✓ Rebuild & Launch Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"

if [ "$MODE" != "dev" ]; then
    echo ""
    echo "Useful commands:"
    echo "  Check status:  systemctl status $SERVICE"
    echo "  View logs:     journalctl -u $SERVICE -f"
    echo "  Stop service:  sudo systemctl stop $SERVICE"
fi