# Permissions Hierarchy

## Role Structure

The bot implements a four-tier role system with cascading permissions:

```
owner > admin > elevated > pleb
```

### Role Definitions

#### 1. Owner (Highest Authority)
- **Complete immunity** from all restrictions (global and individual)
- Full administrative capabilities
- Can grant owner privileges to others via `/grantowner`
- Can promote users to admin via `/makeadmin`
- Can elevate users via `/elevate`
- Can revoke any user's privileges via `/revoke`
- Access to treasury/giveaway commands
- Master owner defined in `.env` file (`OWNER_ID`)

#### 2. Admin
- **Complete immunity** from all restrictions (global and individual)
- Can manage users (elevate/revoke elevated users only)
- Can add/remove restrictions on users
- Can jail/unjail users
- Can manage blacklist/whitelist
- Access to treasury/giveaway commands
- **Cannot** revoke other admins or owners
- **Cannot** promote users to admin or owner

#### 3. Elevated
- **Partial immunity**: Exempt from global restrictions only
- **Still subject** to individual user restrictions
- Can view administrative information
- Cannot modify user permissions
- Cannot add/remove restrictions

#### 4. Pleb (Default)
- Subject to all restrictions (both global and individual)
- Can pay fines and interact with basic commands
- Cannot access administrative features

## Restriction Enforcement

### Message Filtering Logic (`src/middleware/messageFilter.ts`)

1. **Whitelist, Owner, Admin**: Skip ALL filtering
2. **Jail/Mute**: Applied to all users (including elevated) if individually muted
3. **Global Restrictions**: Applied to pleb users only (elevated users are exempt)
4. **Individual Restrictions**: Applied to ALL users except owner/admin

### Restriction Types

**Global Restrictions** (apply to all non-elevated users):
- Applied via `/addaction`
- Elevated+ users are exempt

**Individual Restrictions** (apply to specific users):
- Applied via `/addrestriction <userId>`
- Only owner/admin are exempt
- Elevated users ARE subject to these

## Commands by Role

### Everyone
- `/help` - Show available commands
- `/mystatus` - Check jail status and fines
- `/violations` - Check violations
- `/payfine` - Pay specific fine
- `/paybail` - Pay own bail
- `/paybailfor` - Pay bail for another user
- `/verifybail` - Verify bail payment

### Elevated+ (elevated, admin, owner)
- `/viewactions` - View global restrictions
- `/viewwhitelist` - View whitelisted users
- `/viewblacklist` - View blacklisted users
- `/listrestrictions` - View user restrictions

### Admin+ (admin, owner)
- `/elevate <username|userId>` - Grant elevated privileges
- `/revoke <username|userId>` - Revoke privileges (elevated only for admins)
- `/listadmins` - List all privileged users
- `/addrestriction` - Add user restriction
- `/removerestriction` - Remove user restriction
- `/addwhitelist` - Whitelist user
- `/removewhitelist` - Remove from whitelist
- `/addblacklist` - Blacklist user
- `/removeblacklist` - Remove from blacklist
- `/jail` - Jail user
- `/unjail` - Release user
- `/warn` - Issue warning
- `/balance` - Check bot wallet balance
- `/treasury` - View treasury status
- `/giveaway <@username|userId> <amount>` - Send JUNO to user

### Owner Only
- `/setowner` - Initialize master owner (first run)
- `/grantowner <@username|userId>` - Grant owner privileges
- `/makeadmin <username>` - Promote to admin
- `/revoke` - Revoke any privileges (including admin/owner)
- `/clearviolations` - Clear violations
- `/stats` - View bot statistics
- `/addaction` - Add global restriction
- `/removeaction` - Remove global restriction

## Middleware Functions

Located in `src/middleware/index.ts`:

- **`ownerOnly`** - Owners only
- **`adminOrHigher`** - Admins and owners
- **`elevatedOrHigher`** - Elevated, admins, and owners

Legacy aliases (for backward compatibility):
- `elevatedAdminOnly` → `adminOrHigher`
- `isElevated` → `elevatedOrHigher`
- `elevatedUserOnly` → `elevatedOrHigher`

## Setup Instructions

1. Set `OWNER_ID` in `.env` file to your Telegram user ID
2. Start the bot
3. Run `/setowner` to initialize yourself as master owner
4. Use `/grantowner <userId>` to add co-owners
5. Use `/makeadmin <username>` to add admins
6. Use `/elevate <username>` to add elevated users

## Important Notes

- Multiple owners are supported - all have equal privileges
- Admins cannot modify other admins or owners
- Elevated status is for trusted users who need to see admin info but not modify settings
- Individual restrictions override elevated status (admins placing specific restrictions on elevated users)
- Jail/mute applies to everyone except owner/admin
