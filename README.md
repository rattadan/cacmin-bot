# **CAC Admin Bot**

Cosmos Airdrops Chat **Improved Admin Bot** built with [Telegraf](https://telegraf.js.org/) in TypeScript. It provides excessively granular, advanced administrative features for managing the leading Cosmos Telegram group, including individual user restrictions, highly specific actions blacklisting, and arguably reckless role-based permissions.

## **Features**

- **Role Management**:
  - Supports `owner`, `admin`, `elevated`, and `pleb` roles.
  - Owners can promote admins and users to `elevated` role.
  - `Elevated admins` can promote users to `elevated` role.
  - `Elevated` users can manage certain bot functions but cannot assign roles.

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

### **Quick Start**

For the fastest setup with automatic wallet configuration:

```bash
# Clone and install
git clone <repo-url>
cd cacmin-bot
yarn install

# Create minimal .env file
echo "BOT_TOKEN=your_bot_token_here" > .env
echo "OWNER_ID=your_telegram_user_id_1,your_telegram_user_id_2" >> .env
echo "ADMIN_ID=admin_user_id_1,admin_user_id_2" >> .env
echo "BOT_TREASURY_ADDRESS=juno1..." >> .env
echo "BOT_TREASURY_MNEMONIC=word1 word2 ..." >> .env
echo "JUNO_RPC_URL=https://rpc.juno.basementnodes.ca" >> .env

# Initialize database and migrate to unified wallet
yarn setup-db
yarn migrate:wallet

# Build and launch
./rebuild.sh
```

### **Rebuild & Deploy**

The project includes a unified rebuild script for easy deployment:

```bash
# Default: Clean, rebuild, and restart service
./rebuild.sh

# Development mode: Clean, rebuild, and run with hot reload
./rebuild.sh --dev

# Quick rebuild: Skip cleaning, just rebuild and restart
./rebuild.sh --quick

# Full clean: Remove everything including caches, then rebuild
./rebuild.sh --full
```

NPM scripts are also available:

```bash
yarn rebuild       # Default rebuild
yarn rebuild:dev   # Development mode
yarn rebuild:quick # Quick rebuild
yarn rebuild:full  # Full clean rebuild
```

### **Manual Installation**

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd cacmin-bot
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Configure the bot:
   - Copy `.env.example` to `.env`:

     ```bash
     cp .env.example .env
     ```

   - Edit `.env` and set required configuration:

     ```env
     BOT_TOKEN=your_bot_token_here
     OWNER_ID=owner_id_1,owner_id_2
     ADMIN_ID=admin_id_1,admin_id_2
     BOT_TREASURY_ADDRESS=juno1...
     BOT_TREASURY_MNEMONIC=word1 word2 ...
     JUNO_RPC_URL=https://rpc.juno.basementnodes.ca
     ```

4. Set up wallet (if needed):

   ```bash
   # Generate a new wallet (optional)
   npx ts-node scripts/wallet-utils.ts

   # Add the generated address and mnemonic to .env as shown above
   ```

5. Initialize the database:

   ```bash
   yarn run setup-db
   ```

6. Build and start the bot:

   ```bash
   # For production with systemd
   sudo ./rebuild.sh

   # For development
   ./rebuild.sh --dev

   # Or use yarn scripts
   yarn rebuild      # Production
   yarn rebuild:dev  # Development
   ```

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

### **Role Management**

- **Set Group Owner**:

  ```plaintext
  /setowner
  ```

  - Automatically assigns the group creator as the owner.

- **Promote Users**:
  - `Elevate` a user to manage bot functions:

    ```plaintext
    /elevate <username>
    ```

  - Promote a user to `admin`:

    ```plaintext
    /makeadmin <username>
    ```

- **Demote Users**:
  - Revoke elevated/admin privileges:

    ```plaintext
    /revoke <username>
    ```

---

### **Blacklist Management**

- **View Blacklist**:

  ```plaintext
  /viewblacklist
  ```

  - Lists all blacklisted users.

- **Add to Blacklist**:

  ```plaintext
  /addblacklist <userId>
  ```

  - Blacklists a user by their Telegram ID.

- **Remove from Blacklist**:

  ```plaintext
  /removeblacklist <userId>
  ```

---

### **Global Action Management**

- **View Global Restrictions**:

  ```plaintext
  /viewactions
  ```

- **Add a Global Restriction**:

  ```plaintext
  /addaction <restriction> [restrictedAction]
  ```

- **Remove a Global Restriction**:

  ```plaintext
  /removeaction <restriction>
  ```

---

### **Wallet Commands**

- **Check Balance**:

  ```plaintext
  /balance
  ```

- **Get Deposit Instructions**:

  ```plaintext
  /deposit
  ```

  - Provides unique deposit address and memo for automatic crediting

- **Send Funds**:

  ```plaintext
  /send <amount> <@user|userId|address>
  ```

  - Internal transfers (to other users) are instant and fee-free
  - External transfers (to Juno addresses) go on-chain

- **Withdraw to External Address**:

  ```plaintext
  /withdraw <amount> <juno_address>
  ```

- **View Transaction History**:

  ```plaintext
  /transactions
  ```

- **Verify Deposit**:

  ```plaintext
  /verifydeposit <tx_hash>
  ```

  - Manually verify and credit a deposit transaction

- **Check Deposit Status**:

  ```plaintext
  /checkdeposit <tx_hash>
  ```

---

### **User-Specific Restrictions**

- **View User Restrictions**:

  ```plaintext
  /listrestrictions <userId>
  ```

- **Add a User Restriction**:

  ```plaintext
  /addrestriction <userId> <restriction> [restrictedAction] [restrictedUntil]
  ```

- **Remove a User Restriction**:

  ```plaintext
  /removerestriction <userId> <restriction>
  ```

---

### **Violation Management**

- **View Violations**:

  ```plaintext
  /violations
  ```

  - Lists the current user's violations.

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
