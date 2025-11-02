# Deployment Guide

This guide covers deploying the CAC Admin Bot to a production server (tested on Raspberry Pi 4 ARM64).

## Prerequisites

- Linux server (Ubuntu/Debian recommended)
- Node.js 16+ installed
- Root or sudo access
- Bot token from @BotFather
- JUNO wallet with funds for gas fees

## Quick Start

### 1. Install Node.js (if not already installed)

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Download Release

Download the latest release from GitHub:

```bash
wget https://github.com/cac-group/cacmin-bot/releases/latest/download/cacmin-bot-dist.tar.gz
```

Or build from source:

```bash
git clone https://github.com/cac-group/cacmin-bot.git
cd cacmin-bot
yarn install
yarn build
```

### 3. Prepare Environment File

Create a `.env` file with your configuration:

```bash
cat > .env << 'EOF'
BOT_TOKEN=your_bot_token_from_botfather
CHAT_ID=your_telegram_group_id
OWNER_USER_ID=your_telegram_user_id

RPC_ENDPOINT=https://rpc.juno.strange.love:443
REST_ENDPOINT=https://lcd.juno.strange.love:443
CHAIN_ID=juno-1
DENOM=ujuno

USER_FUNDS_ADDRESS=juno1...your_wallet_address
USER_FUNDS_MNEMONIC=your wallet mnemonic phrase here

BOT_TREASURY_ADDRESS=juno1...treasury_address
BOT_TREASURY_MNEMONIC=treasury wallet mnemonic here

DATABASE_PATH=./data/bot.db
LOG_LEVEL=info
EOF

chmod 600 .env
```

**Important:** Keep your `.env` file secure. It contains sensitive credentials.

### 4. Run Installation Script

If installing from release tarball:

```bash
tar -xzf cacmin-bot-dist.tar.gz
sudo ./install.sh
```

If installing from source:

```bash
sudo ./install.sh
```

The script will:
- Create `cacmin-bot` system user
- Install files to `/opt/cacmin-bot`
- Set proper permissions
- Install systemd service
- Enable auto-start on boot

### 5. Start the Bot

```bash
sudo systemctl start cacmin-bot
```

### 6. Verify Installation

Check service status:

```bash
sudo systemctl status cacmin-bot
```

View logs:

```bash
sudo journalctl -u cacmin-bot -f
```

Test in Telegram:

```
/balance
```

## Manual Installation (Without install.sh)

If you prefer manual installation:

```bash
# Create user
sudo useradd --system --home-dir /opt/cacmin-bot --shell /bin/false cacmin-bot

# Create directories
sudo mkdir -p /opt/cacmin-bot/data

# Extract files
sudo tar -xzf cacmin-bot-dist.tar.gz -C /opt/cacmin-bot/

# Install dependencies
cd /opt/cacmin-bot
sudo -u cacmin-bot yarn install --production

# Copy .env file
sudo cp /path/to/.env /opt/cacmin-bot/.env

# Set permissions
sudo chown -R cacmin-bot:cacmin-bot /opt/cacmin-bot
sudo chmod 600 /opt/cacmin-bot/.env

# Install systemd service
sudo cp /opt/cacmin-bot/cacmin-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cacmin-bot
sudo systemctl start cacmin-bot
```

## Service Management

### Start/Stop/Restart

```bash
sudo systemctl start cacmin-bot
sudo systemctl stop cacmin-bot
sudo systemctl restart cacmin-bot
```

### Enable/Disable Auto-Start

```bash
sudo systemctl enable cacmin-bot   # Start on boot
sudo systemctl disable cacmin-bot  # Don't start on boot
```

### View Logs

```bash
# Follow logs in real-time
sudo journalctl -u cacmin-bot -f

# View last 100 lines
sudo journalctl -u cacmin-bot -n 100

# View logs since boot
sudo journalctl -u cacmin-bot -b

# View logs for specific date
sudo journalctl -u cacmin-bot --since "2024-01-01" --until "2024-01-02"
```

## Configuration Updates

After updating `.env`:

```bash
sudo systemctl restart cacmin-bot
```

## Database Management

### Backup Database

```bash
sudo -u cacmin-bot cp /opt/cacmin-bot/data/bot.db /opt/cacmin-bot/data/bot.db.backup-$(date +%s)
```

### Restore Database

```bash
sudo systemctl stop cacmin-bot
sudo -u cacmin-bot cp /opt/cacmin-bot/data/bot.db.backup-TIMESTAMP /opt/cacmin-bot/data/bot.db
sudo systemctl start cacmin-bot
```

### Query Database

```bash
sudo -u cacmin-bot sqlite3 /opt/cacmin-bot/data/bot.db "SELECT COUNT(*) FROM users;"
```

### Run Test Helper

```bash
cd /opt/cacmin-bot
sudo -u cacmin-bot npx ts-node tests/e2e-test-helper.ts stats
```

## Upgrading

### From GitHub Release

```bash
# Stop the bot
sudo systemctl stop cacmin-bot

# Backup database
sudo -u cacmin-bot cp /opt/cacmin-bot/data/bot.db /opt/cacmin-bot/data/bot.db.backup-$(date +%s)

# Download new release
cd /tmp
wget https://github.com/cac-group/cacmin-bot/releases/latest/download/cacmin-bot-dist.tar.gz

# Extract new version
sudo tar -xzf cacmin-bot-dist.tar.gz -C /opt/cacmin-bot/ --overwrite

# Install dependencies
cd /opt/cacmin-bot
sudo -u cacmin-bot yarn install --production --frozen-lockfile

# Restart service
sudo systemctl restart cacmin-bot
```

### From Source

```bash
# Stop the bot
sudo systemctl stop cacmin-bot

# Backup database
sudo -u cacmin-bot cp /opt/cacmin-bot/data/bot.db /opt/cacmin-bot/data/bot.db.backup-$(date +%s)

# Pull latest changes
cd /path/to/cacmin-bot
git pull origin main

# Build
yarn install
yarn build

# Run install script (will preserve .env)
sudo ./install.sh

# Service restarts automatically if it was running
```

## Troubleshooting

### Bot Not Starting

Check logs:

```bash
sudo journalctl -u cacmin-bot -n 50
```

Common issues:
- Missing or invalid `.env` file
- Database permissions
- Network connectivity (RPC endpoints)
- Invalid bot token

### Permission Errors

Reset permissions:

```bash
sudo chown -R cacmin-bot:cacmin-bot /opt/cacmin-bot
sudo chmod 600 /opt/cacmin-bot/.env
sudo chmod 750 /opt/cacmin-bot/data
```

### Database Locked

Stop the service and check for stale locks:

```bash
sudo systemctl stop cacmin-bot
sudo -u cacmin-bot sqlite3 /opt/cacmin-bot/data/bot.db "PRAGMA integrity_check;"
sudo systemctl start cacmin-bot
```

### Out of Memory (Raspberry Pi)

Monitor memory usage:

```bash
free -h
sudo systemctl status cacmin-bot
```

Consider:
- Increasing swap space
- Reducing log retention
- Monitoring with `htop`

## Security Recommendations

1. **Protect .env file:**
   ```bash
   sudo chmod 600 /opt/cacmin-bot/.env
   ```

2. **Regular backups:**
   - Automate database backups with cron
   - Store backups off-server

3. **Update regularly:**
   - Monitor GitHub releases
   - Apply security updates promptly

4. **Monitor logs:**
   - Set up log rotation
   - Check for suspicious activity

5. **Firewall:**
   - No inbound ports needed (bot connects outbound to Telegram)
   - Secure SSH access

## Monitoring

### Health Check Script

Create `/opt/cacmin-bot/healthcheck.sh`:

```bash
#!/bin/bash
if systemctl is-active --quiet cacmin-bot; then
    echo "Bot is running"
    exit 0
else
    echo "Bot is NOT running"
    exit 1
fi
```

### Automated Restart on Failure

The systemd service is configured to restart automatically on failure. To verify:

```bash
systemctl show cacmin-bot | grep Restart
```

## Performance Tuning

### For Raspberry Pi 4

1. **Enable swap if needed:**
   ```bash
   sudo dphys-swapfile swapoff
   sudo nano /etc/dphys-swapfile  # Set CONF_SWAPSIZE=2048
   sudo dphys-swapfile setup
   sudo dphys-swapfile swapon
   ```

2. **Reduce log verbosity:**
   ```bash
   # In .env:
   LOG_LEVEL=warn
   ```

3. **Log rotation:**
   ```bash
   sudo journalctl --vacuum-time=7d
   ```

## Support

- GitHub Issues: https://github.com/cac-group/cacmin-bot/issues
- Documentation: See README.md and guides in project root

## Files and Directories

- `/opt/cacmin-bot/` - Installation directory
- `/opt/cacmin-bot/data/bot.db` - SQLite database
- `/opt/cacmin-bot/.env` - Configuration file (sensitive)
- `/etc/systemd/system/cacmin-bot.service` - Systemd service file
- `/opt/cacmin-bot/dist/` - Compiled JavaScript
- `/opt/cacmin-bot/node_modules/` - Dependencies
