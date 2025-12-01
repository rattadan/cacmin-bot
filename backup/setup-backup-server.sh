#!/bin/bash
# Setup script for Litestream backup target (run on the LXC container)
# This creates a dedicated litestream user with restricted SFTP access

set -euo pipefail

BACKUP_USER="litestream"
BACKUP_DIR="/backups/cacmin-bot"
AUTHORIZED_KEYS_FILE="/etc/ssh/authorized_keys_${BACKUP_USER}"

echo "=== Litestream Backup Server Setup ==="

# Create backup user with no login shell
if ! id "$BACKUP_USER" &>/dev/null; then
	echo "Creating user: $BACKUP_USER"
	useradd -r -m -d /home/$BACKUP_USER -s /usr/sbin/nologin "$BACKUP_USER"
else
	echo "User $BACKUP_USER already exists"
fi

# Create backup directory
echo "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
chown "$BACKUP_USER:$BACKUP_USER" "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Create authorized_keys file location
echo "Setting up SSH authorized_keys"
touch "$AUTHORIZED_KEYS_FILE"
chmod 644 "$AUTHORIZED_KEYS_FILE"

# Configure SSH for restricted SFTP-only access
SSHD_CONFIG="/etc/ssh/sshd_config"

if ! grep -q "Match User $BACKUP_USER" "$SSHD_CONFIG"; then
	echo "Configuring SSH for restricted SFTP access"
	cat >> "$SSHD_CONFIG" << EOF

# Litestream backup user - SFTP only, chrooted
Match User $BACKUP_USER
	AuthorizedKeysFile $AUTHORIZED_KEYS_FILE
	ForceCommand internal-sftp
	ChrootDirectory /backups
	PermitTunnel no
	AllowAgentForwarding no
	AllowTcpForwarding no
	X11Forwarding no
EOF

	# Fix chroot ownership (must be owned by root)
	chown root:root /backups
	chmod 755 /backups

	echo "Restarting SSH service"
	systemctl restart sshd
else
	echo "SSH already configured for $BACKUP_USER"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Generate SSH key on pi0:"
echo "   sudo ssh-keygen -t ed25519 -f /etc/litestream/id_ed25519 -N ''"
echo ""
echo "2. Copy the public key to this server:"
echo "   cat /etc/litestream/id_ed25519.pub"
echo ""
echo "3. Add it to: $AUTHORIZED_KEYS_FILE"
echo ""
echo "4. Test connection from pi0:"
echo "   sudo sftp -i /etc/litestream/id_ed25519 ${BACKUP_USER}@<this-server-ip>"
echo ""
echo "Backup directory: $BACKUP_DIR"
