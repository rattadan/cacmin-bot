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

- **Two-Wallet Internal Ledger System**:
  - Minimizes on-chain transactions for significant cost savings
  - Instant, fee-free internal transfers between users
  - Automatic deposit detection with memo-based routing
  - Secure withdrawal flow with transaction locking
  - Complete audit trail of all financial operations
  - Separate treasury for enforcement (bail/fines) and user funds
  - **See [docs/WALLET_ARCHITECTURE.md](docs/WALLET_ARCHITECTURE.md) for comprehensive documentation**

## **Installation**

1. Clone the repository:

   ```bash
   git clone <repo-url>
   cd <repo-folder>
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Configure the bot token:
   - Add a `config.ts` file in the root directory:

     ```typescript
     export const BOT_TOKEN = 'YOUR_BOT_TOKEN';
     ```

   - Replace `YOUR_BOT_TOKEN` with your Telegram bot token.

4. Set up the SQLite database:

   ```bash
   yarn run setup-db
   ```

5. Start the bot:

   ```bash
   yarn start
   ```

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
