# **CAC Admin Bot**

Cosmos Airdrops Chat **Improved Admin Bot** built with [Telegraf](https://telegraf.js.org/) in TypeScript. It provides excessively granular, advanced administrative features for managing the leading Cosmos Telegram group, including individual user restrictions, highly specific actions blacklisting, and arguably reckless role-based permissions.

## **Features**

- **Role Management**:
  - **Four-tier role hierarchy**: `owner` > `admin` > `elevated` > `pleb`
  - **Owner**: Full control including wallet/treasury access, role promotions, and bot configuration
  - **Admin**: Moderation powers (jail, restrictions, blacklist) but NO access to funds, treasury, or config
  - **Elevated**: Basic user with wallet access, can view lists and statistics, minor perks
  - **Pleb**: Default role for all users
  - Owners can promote users to admin or elevated roles
  - Admins can promote users to elevated role and revoke elevated privileges

- **User Restrictions**:
  - Restrict specific users from performing actions like:
    - Sending stickers or specific sticker packs.
    - Sharing URLs (globally or for specific domains).
    - Sending messages containing specific text patterns (via regex).
  - Restrictions can have expiration timestamps for temporary penalties.

- **Blacklist Management**:
  - Blacklist users to apply additional global restrictions.
  - View, add, and remove blacklisted users.

- **Global Action Management**:
  - Add or remove global restrictions affecting all users.

- **Violation Tracking**:
  - Log user violations and enforce penalties.
  - Enable users to view and pay fines (e.g., in JUNO tokens) to reduce penalties.

- **Unified Wallet System**:
  - Single JUNO wallet with internal ledger for all users
  - Automatic deposit detection via RPC monitoring with memo-based routing
  - Structural protobuf parsing for reliable memo extraction
  - Instant, fee-free internal transfers between users
  - Secure withdrawal flow with transaction locking
  - Complete audit trail of all financial operations
  - Balance reconciliation and treasury monitoring
  - Shared account support for multi-user wallets
  - Manual deposit processing and unclaimed deposit management
  - **See [ADMIN_MANUAL.md](ADMIN_MANUAL.md) for operational documentation**

## **Installation**

```bash
# Clone and setup
git clone <repo-url> && cd cacmin-bot
yarn install

# Configure .env
cp .env.example .env
# Edit .env with: BOT_TOKEN, OWNER_ID, ADMIN_ID, BOT_TREASURY_ADDRESS, BOT_TREASURY_MNEMONIC, JUNO_RPC_URL

# Initialize and run
yarn setup-db
./rebuild.sh          # Production
./rebuild.sh --dev    # Development
```

**Rebuild options**: `./rebuild.sh [--dev|--quick|--full]` or use `yarn rebuild[:dev|:quick|:full]`

---

## **Production Deployment**

For deploying to a production server (Raspberry Pi, VPS, etc.):

### **Option 1: GitHub Release (Recommended)**

Download and deploy the latest pre-built release:

```bash
# Download latest release
wget https://github.com/cac-group/cacmin-bot/releases/latest/download/cacmin-bot-dist.tar.gz

# Extract and run installer
tar -xzf cacmin-bot-dist.tar.gz
sudo ./install.sh
```

The installer will:
- Create a dedicated system user (`cacmin-bot`)
- Install to `/opt/cacmin-bot` with proper permissions
- Set up systemd service for auto-start
- Configure secure file permissions

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment documentation.

### **Option 2: Build Your Own Release**

Build and package locally, then deploy:

```bash
# Build locally
yarn install
yarn build

# Run installer on target server
sudo ./install.sh
```

### **GitHub Actions Workflow**

The project includes a GitHub Actions workflow that automatically:
- Builds the TypeScript code
- Creates a release tarball with all necessary files
- Uploads artifacts and creates GitHub releases
- Triggered by version tags (e.g., `v1.0.0`) or manual dispatch

To create a new release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow builds on `ubuntu-latest` which is compatible with ARM64 servers like Raspberry Pi 4.

---

## **Usage**

Use `/help` in a DM with the bot for a comprehensive, role-based command reference.

### **Key Commands**

**Wallet** (All Users):
- `/balance`, `/deposit`, `/send`, `/withdraw`, `/transactions`

**Moderation** (Admin+):
- `/jail <user> <minutes>`, `/unjail <user>`, `/warn <userId> <reason>`
- `/addrestriction`, `/addblacklist`, `/addwhitelist`

**Treasury** (Owner Only):
- `/botbalance`, `/treasury`, `/giveaway`, `/walletstats`, `/reconcile`

**Role Management** (Owner):
- `/setowner`, `/makeadmin <user>`, `/elevate <user>`, `/revoke <user>`

---

## **Testing**

```bash
yolo
```

---

## **Development Notes**

### **Project Structure**

```plaintext
.
├── bot.ts                  # Entry point for the bot
├── config.ts               # Configuration file
├── database.ts             # Database setup and queries
├── handlers/               # Command handlers
│   ├── actions.ts          # Global restrictions
│   ├── blacklist.ts        # Blacklist management
│   ├── restrictions.ts     # User-specific restrictions
│   ├── roles.ts            # Role management
│   └── violations.ts       # Violation tracking
├── middleware/             # Middleware for authorization and user management
├── services/               # Services for database operations
├── types.ts                # Type definitions
└── utils/                  # Utility functions
    └── roles.ts            # Role validation utilities
```

---

## **Contributing**

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feature/your-feature
   ```

3. Commit changes and push to your fork.
4. Open a pull request.

---

## **License**

This project is licensed under the MIT License. See `LICENSE` for details.
