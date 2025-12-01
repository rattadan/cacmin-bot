#!/bin/bash
# Litestream setup script for cacmin-bot (run on pi0)
# Usage: sudo ./setup-litestream.sh <backup-server-ip>

set -euo pipefail

BACKUP_SERVER="${1:-}"
LITESTREAM_VERSION="v0.3.13"
ARCH=$(dpkg --print-architecture)

if [[ -z "$BACKUP_SERVER" ]]; then
	echo "Usage: sudo $0 <backup-server-ip>"
	echo "Example: sudo $0 192.168.1.100"
	exit 1
fi

if [[ $EUID -ne 0 ]]; then
	echo "This script must be run as root"
	exit 1
fi

echo "=== Litestream Setup for cacmin-bot ==="
echo "Backup server: $BACKUP_SERVER"
echo ""

# Determine download URL based on architecture
case "$ARCH" in
	amd64) DL_ARCH="amd64" ;;
	arm64) DL_ARCH="arm64" ;;
	armhf) DL_ARCH="arm7" ;;
	*) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

# Download and install Litestream
echo "Installing Litestream ${LITESTREAM_VERSION}..."
LITESTREAM_URL="https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${DL_ARCH}.tar.gz"

cd /tmp
curl -fsSL "$LITESTREAM_URL" -o litestream.tar.gz
tar -xzf litestream.tar.gz
mv litestream /usr/local/bin/
chmod +x /usr/local/bin/litestream
rm litestream.tar.gz

echo "Litestream installed: $(litestream version)"

# Create config directory
echo "Creating config directory..."
mkdir -p /etc/litestream

# Generate SSH key for SFTP authentication
SSH_KEY="/etc/litestream/id_ed25519"
if [[ ! -f "$SSH_KEY" ]]; then
	echo "Generating SSH key..."
	ssh-keygen -t ed25519 -f "$SSH_KEY" -N '' -C "litestream@$(hostname)"
	chmod 600 "$SSH_KEY"
	chmod 644 "${SSH_KEY}.pub"
else
	echo "SSH key already exists: $SSH_KEY"
fi

# Install config file with actual backup server IP
echo "Installing configuration..."
cat > /etc/litestream.yml << EOF
# Litestream configuration for cacmin-bot database replication

# Prometheus metrics endpoint for monitoring
addr: ":9091"

# Logging configuration
logging:
  level: info
  type: json
  stderr: true

dbs:
  - path: /opt/cacmin-bot/data/bot.db

    # Monitor for changes every second
    monitor-interval: 1s

    replica:
      type: sftp
      host: ${BACKUP_SERVER}:22
      user: litestream
      key-path: ${SSH_KEY}
      path: /cacmin-bot

      # Real-time sync
      sync-interval: 1s

      # Retain 72 hours of WAL files for point-in-time recovery
      retention: 72h
      retention-check-interval: 1h

      # Validate replica integrity daily
      validation-interval: 24h
EOF

# Install systemd service
echo "Installing systemd service..."
cat > /etc/systemd/system/litestream.service << 'EOF'
[Unit]
Description=Litestream SQLite Replication
Documentation=https://litestream.io
After=network-online.target
Wants=network-online.target

StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=root
Group=root

ExecStart=/usr/local/bin/litestream replicate -config /etc/litestream.yml

Restart=always
RestartSec=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=litestream

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/cacmin-bot/data

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

echo ""
echo "=== Setup Complete ==="
echo ""
echo "PUBLIC KEY (add this to backup server):"
echo "========================================"
cat "${SSH_KEY}.pub"
echo "========================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Add the public key above to the backup server:"
echo "   /etc/ssh/authorized_keys_litestream"
echo ""
echo "2. Test SFTP connection:"
echo "   sudo sftp -i $SSH_KEY litestream@$BACKUP_SERVER"
echo ""
echo "3. Once connection works, start litestream:"
echo "   sudo systemctl enable litestream"
echo "   sudo systemctl start litestream"
echo "   sudo systemctl status litestream"
echo ""
echo "4. Add Prometheus scrape config (metrics at :9091):"
echo "   - job_name: 'litestream'"
echo "     static_configs:"
echo "       - targets: ['$(hostname):9091']"
echo ""
echo "5. Import Grafana dashboard from:"
echo "   backup/grafana-dashboard.json"
echo ""
echo "6. Add Prometheus alerting rules from:"
echo "   backup/prometheus-alerts.yml"
