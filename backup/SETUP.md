# Litestream Database Backup Setup

Real-time SQLite replication for cacmin-bot using Litestream with Prometheus/Grafana monitoring.

## Architecture

```
┌─────────────────────┐         SFTP/SSH (port 2222)        ┌─────────────────────┐
│   pi0 (primary)     │ ──────────────────────────────────► │   Proxmox Host      │
│                     │         real-time WAL sync          │        │            │
│  /opt/cacmin-bot/   │                                     │   port 2222         │
│    data/bot.db      │                                     │        ▼            │
│                     │                                     │  ┌─────────────┐    │
│  litestream:9091 ◄──┼── Prometheus scrape                 │  │ LXC Container│    │
└─────────────────────┘                                     │  │  port 22     │    │
                                                            │  │              │    │
                                                            │  │ /backups/    │    │
                                                            │  │  cacmin-bot/ │    │
                                                            │  └─────────────┘    │
                                                            └─────────────────────┘
```

## Ports

| Service | Host | Port | Purpose |
|---------|------|------|---------|
| SFTP | LXC container | 22 | SSH/SFTP for Litestream replication |
| SFTP proxy | Proxmox host | 2222 | Proxy to container:22 |
| Metrics | pi0 | 9091 | Prometheus metrics endpoint |

## Setup Steps

### 1. Create LXC Container

On your Proxmox server, create a lightweight LXC container (Debian/Ubuntu) for backups.

Recommended specs:
- 1 CPU core
- 512MB RAM
- 10GB+ disk (depending on retention needs)

### 2. Setup Port Forwarding on Proxmox Host

Forward host port 2222 to container port 22. Example using iptables:

```bash
# Replace CONTAINER_IP with actual container IP
iptables -t nat -A PREROUTING -p tcp --dport 2222 -j DNAT --to-destination CONTAINER_IP:22
iptables -A FORWARD -p tcp -d CONTAINER_IP --dport 22 -j ACCEPT
```

Or if using a reverse proxy/firewall, configure accordingly.

### 3. Setup Backup Server (LXC Container)

Copy `setup-backup-server.sh` to the container and run:

```bash
sudo ./setup-backup-server.sh
```

This creates:
- `litestream` user with SFTP-only access
- `/backups/cacmin-bot/` directory
- SSH config for chrooted SFTP

### 4. Setup Primary Server (pi0)

Run the setup script with the Proxmox host IP and proxied port:

```bash
sudo ./setup-litestream.sh PROXMOX_HOST_IP
```

**Important:** After running, edit `/etc/litestream.yml` to use the proxied port:

```yaml
replica:
  type: sftp
  host: PROXMOX_HOST_IP:2222  # Use proxied port, not 22
  user: litestream
  key-path: /etc/litestream/id_ed25519
  path: /cacmin-bot
```

### 5. Copy SSH Public Key

The setup script outputs the public key. Add it to the backup container:

```bash
# On backup container
echo "ssh-ed25519 AAAA... litestream@pi0" >> /etc/ssh/authorized_keys_litestream
```

### 6. Test SFTP Connection

From pi0:

```bash
sudo sftp -P 2222 -i /etc/litestream/id_ed25519 litestream@PROXMOX_HOST_IP
```

Should connect and drop you into the `/cacmin-bot` directory (chrooted).

### 7. Start Litestream

```bash
sudo systemctl enable litestream
sudo systemctl start litestream
sudo systemctl status litestream
```

Check logs:

```bash
sudo journalctl -u litestream -f
```

### 8. Configure Prometheus

Add to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'litestream'
    static_configs:
      - targets: ['pi0:9091']
    scrape_interval: 15s
```

Copy alert rules:

```bash
cp prometheus-alerts.yml /etc/prometheus/rules/litestream.yml
```

Reload Prometheus:

```bash
sudo systemctl reload prometheus
```

### 9. Import Grafana Dashboard

1. Open Grafana
2. Go to Dashboards → Import
3. Upload `grafana-dashboard.json`
4. Select your Prometheus datasource

## Files Reference

| File | Install Location | Purpose |
|------|------------------|---------|
| `litestream.yml` | `/etc/litestream.yml` | Litestream config |
| `litestream.service` | `/etc/systemd/system/litestream.service` | systemd service |
| `prometheus-alerts.yml` | `/etc/prometheus/rules/litestream.yml` | Alert rules |
| `grafana-dashboard.json` | Import via Grafana UI | Dashboard |

## Prometheus Alerts

| Alert | Severity | Description |
|-------|----------|-------------|
| LitestreamDown | critical | Metrics endpoint unreachable 2m+ |
| LitestreamSyncErrors | warning | Sync errors occurring |
| LitestreamReplicationStalled | warning | No syncs for 5m |
| LitestreamCheckpointErrors | warning | Checkpoint errors |
| LitestreamWALTooLarge | warning | WAL > 100MB |
| LitestreamReplicationLag | warning | Shadow WAL 10MB+ behind |
| LitestreamReplicationDead | critical | No syncs for 15m |
| LitestreamSlowSync | warning | Avg sync time > 5s |

## Restoring from Backup

To restore the database from the replica:

```bash
# Stop the bot first
sudo systemctl stop cacmin-bot

# Restore from SFTP replica
sudo litestream restore -config /etc/litestream.yml -o /opt/cacmin-bot/data/bot.db.restored

# Verify the restored database
sqlite3 /opt/cacmin-bot/data/bot.db.restored "PRAGMA integrity_check;"

# Replace the database (backup original first)
sudo mv /opt/cacmin-bot/data/bot.db /opt/cacmin-bot/data/bot.db.old
sudo mv /opt/cacmin-bot/data/bot.db.restored /opt/cacmin-bot/data/bot.db

# Restart services
sudo systemctl start cacmin-bot
sudo systemctl start litestream
```

## Point-in-Time Recovery

Litestream retains 72 hours of WAL files. To restore to a specific point:

```bash
litestream restore -config /etc/litestream.yml -o /tmp/bot.db -timestamp "2024-01-15T10:30:00Z"
```

## Troubleshooting

### Litestream won't start

Check logs:
```bash
sudo journalctl -u litestream -n 50
```

Common issues:
- SSH key permissions (must be 600)
- SFTP connection failing (test manually)
- Database path incorrect

### SFTP connection refused

1. Verify port forwarding: `nc -zv PROXMOX_HOST 2222`
2. Check container SSH is running: `systemctl status sshd`
3. Verify authorized_keys file permissions

### No metrics in Prometheus

1. Check Litestream is running: `systemctl status litestream`
2. Test metrics endpoint: `curl http://localhost:9091/metrics`
3. Verify Prometheus can reach pi0:9091

### Replication lag alerts

- Check network connectivity to backup server
- Verify disk space on backup container
- Check for SFTP errors in logs

## Maintenance

### Disk Usage

Monitor backup container disk usage. Retention is set to 72 hours, but verify:

```bash
# On backup container
du -sh /backups/cacmin-bot/
```

### Validation

Litestream validates replica integrity daily. Check logs for validation results:

```bash
journalctl -u litestream | grep -i validation
```

### Manual Backup

For an additional manual backup:

```bash
sqlite3 /opt/cacmin-bot/data/bot.db ".backup /tmp/bot-manual-backup.db"
```
