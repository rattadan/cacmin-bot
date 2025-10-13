#!/bin/bash
# CAC Admin Bot - Quick Start Script
# Automatically configures wallets and starts the bot

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
BRIGHT='\033[1m'
NC='\033[0m'

echo -e "${BRIGHT}
╔═══════════════════════════════════════╗
║    CAC Admin Bot - Quick Start        ║
╚═══════════════════════════════════════╝
${NC}"

# Check if .env exists and has basic config
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env with at least BOT_TOKEN and OWNER_ID"
    exit 1
fi

# Source the .env to check configuration
export $(grep -v '^#' .env | xargs)

if [ -z "$BOT_TOKEN" ]; then
    echo -e "${RED}Error: BOT_TOKEN not configured in .env${NC}"
    exit 1
fi

if [ -z "$OWNER_ID" ]; then
    echo -e "${RED}Error: OWNER_ID not configured in .env${NC}"
    exit 1
fi

echo -e "${BLUE}Checking wallet configuration...${NC}"

# Check if wallets are already configured
if [ -n "$BOT_TREASURY_ADDRESS" ] && [ -n "$USER_FUNDS_ADDRESS" ] && [ -n "$USER_FUNDS_MNEMONIC" ]; then
    echo -e "${GREEN}✓ Wallets already configured${NC}"
    echo "  Treasury: $BOT_TREASURY_ADDRESS"
    echo "  User Funds: $USER_FUNDS_ADDRESS"
    echo ""
    read -p "Keep existing configuration? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo -e "${GREEN}Using existing wallet configuration${NC}"
    else
        echo -e "${YELLOW}Setting up new wallets...${NC}"
        echo "1" | npx ts-node scripts/setup-from-single-mnemonic.ts
    fi
else
    echo -e "${YELLOW}Wallets not configured. Setting up now...${NC}"
    echo ""
    echo "This will generate a single mnemonic that controls both wallets"
    echo "using different HD derivation paths."
    echo ""

    # Auto-run setup script with option 1 (generate new)
    echo "1" | npx ts-node scripts/setup-from-single-mnemonic.ts
fi

echo ""
echo -e "${BLUE}Building the bot...${NC}"
yarn build:clean

echo ""
echo -e "${BLUE}Running validation...${NC}"
yarn validate:postbuild

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "${BRIGHT}Bot is ready to run!${NC}"
echo ""
echo "To start the bot:"
echo "  Development:  yarn dev"
echo "  Production:   yarn start"
echo ""
echo "For systemd service:"
echo "  sudo systemctl restart cacmin-bot"
echo "  journal cacmin-bot"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "- Save any generated mnemonic securely"
echo "- Fund the wallets with JUNO if needed"
echo "- Check wallet balances: npx ts-node scripts/verify-wallets.ts"