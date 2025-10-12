#!/bin/bash
# CAC Admin Bot Management Script
# Simple management commands for the bot

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Service name
SERVICE="cacmin-bot"

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}    CAC Admin Bot Management Tool${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_status() {
    echo -e "${GREEN}[*]${NC} $1"
}

print_error() {
    echo -e "${RED}[!]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

show_usage() {
    print_header
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status    - Show service status"
    echo "  start     - Start the bot service"
    echo "  stop      - Stop the bot service"
    echo "  restart   - Restart the bot service"
    echo "  logs      - Show recent logs (last 50 lines)"
    echo "  follow    - Follow logs in real-time"
    echo "  build     - Build the TypeScript project"
    echo "  deploy    - Build and deploy (full deployment)"
    echo "  validate  - Run validation checks"
    echo ""
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This command requires root privileges"
        echo "Run with: sudo $0 $1"
        exit 1
    fi
}

case "$1" in
    status)
        print_header
        print_status "Checking service status..."
        systemctl status $SERVICE --no-pager
        ;;

    start)
        check_root "$1"
        print_header
        print_status "Starting $SERVICE..."
        systemctl start $SERVICE
        sleep 2
        systemctl status $SERVICE --no-pager | head -n 5
        ;;

    stop)
        check_root "$1"
        print_header
        print_status "Stopping $SERVICE..."
        systemctl stop $SERVICE
        print_status "Service stopped"
        ;;

    restart)
        check_root "$1"
        print_header
        print_status "Restarting $SERVICE..."
        systemctl restart $SERVICE
        sleep 2
        systemctl status $SERVICE --no-pager | head -n 5
        ;;

    logs)
        print_header
        print_status "Recent logs (last 50 lines):"
        journalctl -u $SERVICE -n 50 --no-pager
        ;;

    follow)
        print_header
        print_status "Following logs (Ctrl+C to exit):"
        journalctl -u $SERVICE -f
        ;;

    build)
        print_header
        print_status "Building project..."
        yarn build:clean
        print_status "Build completed!"
        ;;

    deploy)
        check_root "$1"
        print_header
        ./scripts/deploy.sh
        ;;

    validate)
        print_header
        print_status "Running validation..."
        yarn validate
        ;;

    *)
        show_usage
        ;;
esac