import { createClient, type Client } from "@libsql/client/web";
import {
  localSendMessage,
  localFetchMessages,
  localEditMessage,
  localEditMessageAnyChat,
  localDeleteMessage,
  localDeleteChat,
  localGetProfile,
  localUpdateProfile,
  localGetChatMeta,
} from "./local-store";

/* ════════════════════════════════════════════════════════════════
   TURSO DATABASE — single source of truth for accounts + presence.

   NOTE: message DELIVERY and the local user PROFILE are handled
   entirely on-device via ./local-store (localStorage). Media files
   (photos/videos to another person) are still uploaded to cloud
   storage first; only the resulting URL flows through the local
   message text. Turso is no longer touched for message bodies or
   profile fields.
   ════════════════════════════════════════════════════════════════ */

const TURSO_URL = "libsql://messaging-app-templr.aws-ap-south-1.turso.io";

// ── AUTH TOKEN ──────────────────────────────────────────────────
// Token for: libsql://messaging-app-templr.aws-ap-south-1.turso.io
// Also falls back to localStorage if blank (for future token rotation)
const TURSO_AUTH_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODExNzg2MDEsImlkIjoiMDE5ZWI2NmItOGYwMS03NjNiLTgxOTktNzJlNzYzNjI5NGZmIiwicmlkIjoiYzI0ZGEyNWEtZDI2Zi00N2IwLWFlNDMtYWJiNWIyMTFkY2UwIn0.B0LVoAj7bh_wpf1Mlk6VmAE53Cx0zCmSWU_zhSe1kqtvnpawCFyY0jq1EJxu5hR3JMCBChWQ-FTMleYjz4NDAQ";

function resolveAuthToken(): string {
  if (TURSO_AUTH_TOKEN) return TURSO_AUTH_TOKEN;
  try {
    return localStorage.getItem("turso_auth_token") || "";
  } catch {
    return "";
  }
}

let _client: Client | null = null;
export function dbClient(): Client {
  if (!_client) {
    _client = createClient({
      url: TURSO_URL,
      authToken: resolveAuthToken() || undefined,
    });
  }
  return _client;
}

/* ============================ SCHEMA ============================ */

let _schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const c = dbClient();
      await c.batch([
        `CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          salt TEXT NOT NULL,
          avatar TEXT,
          contact_token TEXT UNIQUE NOT NULL,
          recovery_hash TEXT,
          last_active INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at INTEGER DEFAULT 0,
          expires_at INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          user_a TEXT NOT NULL,
          user_b TEXT NOT NULL,
          last_message TEXT DEFAULT '',
          last_message_by TEXT DEFAULT '',
          updated_at INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT 0,
          UNIQUE(user_a, user_b)
        )`,
        `CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          from_user TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at INTEGER DEFAULT 0,
          status TEXT DEFAULT 'sent',
          read INTEGER DEFAULT 0
        )`,
        `CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS typing (
          chat_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          updated_at INTEGER DEFAULT 0,
          PRIMARY KEY (chat_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS nudges (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT NOT NULL,
          user_avatar TEXT NOT NULL,
          text TEXT NOT NULL,
          font_id TEXT NOT NULL,
          font_size INTEGER DEFAULT 26,
          font_weight INTEGER DEFAULT 700,
          text_color TEXT NOT NULL,
          bg_color TEXT NOT NULL,
          gradient_bg TEXT NOT NULL,
          border_style TEXT NOT NULL,
          border_radius INTEGER DEFAULT 20,
          text_shadow TEXT NOT NULL,
          text_align TEXT DEFAULT 'center',
          glassmorphism INTEGER DEFAULT 0,
          layout_style TEXT DEFAULT 'standard',
          image_url TEXT,
          image_opacity REAL DEFAULT 1,
          image_blend TEXT DEFAULT 'normal',
          created_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          expires_at INTEGER DEFAULT 0
        )`,
        /* ── GROUP CHAT SYSTEM ── */
        `CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          icon_url TEXT,
          owner_id TEXT NOT NULL,
          created_at INTEGER DEFAULT 0,
          updated_at INTEGER DEFAULT 0,
          message_count INTEGER DEFAULT 0,
          member_count INTEGER DEFAULT 1,
          invite_code TEXT UNIQUE,
          is_public INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS group_members (
          group_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          joined_at INTEGER DEFAULT 0,
          invited_by TEXT,
          nickname TEXT,
          muted INTEGER DEFAULT 0,
          PRIMARY KEY (group_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS group_tags (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at INTEGER DEFAULT 0,
          UNIQUE(group_id, name)
        )`,
        `CREATE TABLE IF NOT EXISTS group_member_tags (
          group_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          assigned_by TEXT,
          assigned_at INTEGER DEFAULT 0,
          PRIMARY KEY (group_id, user_id, tag_id)
        )`,
        `CREATE TABLE IF NOT EXISTS group_messages (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          from_user TEXT NOT NULL,
          text TEXT NOT NULL,
          reply_to TEXT,
          created_at INTEGER DEFAULT 0,
          edited_at INTEGER DEFAULT 0,
          deleted INTEGER DEFAULT 0
        )`,
        `CREATE TABLE IF NOT EXISTS group_message_reactions (
          message_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          emoji TEXT NOT NULL,
          created_at INTEGER DEFAULT 0,
          PRIMARY KEY (message_id, user_id, emoji)
        )`,
        `CREATE TABLE IF NOT EXISTS group_message_reads (
          message_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          read_at INTEGER DEFAULT 0,
          PRIMARY KEY (message_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS group_pins (
          group_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          pinned_by TEXT NOT NULL,
          pinned_at INTEGER DEFAULT 0,
          PRIMARY KEY (group_id, message_id)
        )`,
        `CREATE TABLE IF NOT EXISTS group_bans (
          group_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          banned_by TEXT NOT NULL,
          reason TEXT DEFAULT '',
          banned_at INTEGER DEFAULT 0,
          PRIMARY KEY (group_id, user_id)
        )`,
        `CREATE TABLE IF NOT EXISTS group_admin_log (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          actor_name TEXT NOT NULL,
          action TEXT NOT NULL,
          target_id TEXT,
          target_name TEXT,
          details TEXT DEFAULT '',
          created_at INTEGER DEFAULT 0
        )`,
        `CREATE INDEX IF NOT EXISTS idx_group_messages_group ON group_messages(group_id, created_at)`,
        `CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`,
        `CREATE INDEX IF NOT EXISTS idx_group_member_tags_user ON group_member_tags(group_id, user_id)`,
      ], "write");

      // ── MIGRATIONS ──
      // Older deployments of the nudges table may be missing columns that
      // the current `createNudge` / `listNudges` / `updateNudge` functions
      // write/read. SQLite does not support `ALTER TABLE ... ADD COLUMN IF NOT
      // EXISTS` (older versions), so we attempt every additive column and
      // swallow the "duplicate column name" error that happens when it
      // already exists. This keeps the schema in sync for every existing
      // and new column without ever throwing.
      const expectedNudgeColumns: Array<[string, string]> = [
        ['user_id', 'TEXT NOT NULL DEFAULT ""'],
        ['user_name', 'TEXT NOT NULL DEFAULT ""'],
        ['user_avatar', 'TEXT NOT NULL DEFAULT ""'],
        ['text', 'TEXT NOT NULL DEFAULT ""'],
        ['font_id', 'TEXT NOT NULL DEFAULT ""'],
        ['font_size', 'INTEGER DEFAULT 26'],
        ['font_weight', 'INTEGER DEFAULT 700'],
        ['text_color', 'TEXT NOT NULL DEFAULT ""'],
        ['bg_color', 'TEXT NOT NULL DEFAULT ""'],
        ['gradient_bg', 'TEXT NOT NULL DEFAULT ""'],
        ['border_style', 'TEXT NOT NULL DEFAULT ""'],
        ['border_radius', 'INTEGER DEFAULT 20'],
        ['text_shadow', 'TEXT NOT NULL DEFAULT ""'],
        ['text_align', 'TEXT DEFAULT "center"'],
        ['glassmorphism', 'INTEGER DEFAULT 0'],
        ['layout_style', 'TEXT DEFAULT "standard"'],
        ['image_url', 'TEXT'],
        ['image_opacity', 'REAL DEFAULT 1'],
        ['image_blend', 'TEXT DEFAULT "normal"'],
        ['created_at', 'INTEGER DEFAULT 0'],
        ['updated_at', 'INTEGER DEFAULT 0'],
        ['expires_at', 'INTEGER DEFAULT 0'],
      ];
      for (const [col, def] of expectedNudgeColumns) {
        try {
          await c.execute({
            sql: `ALTER TABLE nudges ADD COLUMN ${col} ${def}`,
          });
        } catch (err: any) {
          // "duplicate column name: <col>" is the expected case for already-migrated DBs.
          if (!/duplicate column/i.test(String(err?.message || err))) {
            // Real error — rethrow so the outer catch can surface it
            throw err;
          }
        }
      }

      // Indexes for the nudges table — wrap each in try/catch so they
      // don't crash older DBs that already created them.
      for (const idx of [
        `CREATE INDEX IF NOT EXISTS idx_nudges_updated ON nudges(updated_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_nudges_author ON nudges(author_id, updated_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_nudges_expires ON nudges(expires_at)`,
      ]) {
        try { await c.execute({ sql: idx }); } catch { /* ignore */ }
      }
    })().catch((e) => {
      _schemaReady = null; // allow retry
      throw friendlyDbError(e);
    });
  }
  return _schemaReady;
}

function friendlyDbError(e: any): Error {
  const msg = String(e?.message || e);
  if (/401|403|auth|token/i.test(msg)) {
    return new Error(
      "Database auth failed. Create a Turso token (`turso db tokens create messaging-app-templr`) " +
      "and set it via localStorage.setItem('turso_auth_token', '<token>') then reload."
    );
  }
  return new Error("Database error: " + msg);
}

/* ============================ CRYPTO HELPERS ============================ */

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return hex(bits);
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Deterministic, globally unique contact token derived from user id. */
export async function deriveContactToken(userId: string): Promise<string> {
  const h = await sha256("nudgel-contact-v1::" + userId);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[parseInt(h.slice(i * 2, i * 2 + 2), 16) % chars.length];
  }
  return `MW-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

function generateRecoveryToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => {
    let s = "";
    for (let i = 0; i < 4; i++) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      s += chars[buf[0] % chars.length];
    }
    return s;
  };
  return `NUDGEL-${seg()}-${seg()}-${seg()}`;
}

/* ============================ AUTH ============================ */

export type AuthUser = {
  uid: string;
  name: string;
  email: string;
  emailVerified: boolean;
  photoURL: string | null;
  createdAt: string;
  lastSignIn: string;
  recoveryToken: string | null;
  contactToken?: string;
};

const SESSION_KEY = "nudgel_session";

type AuthListener = (user: AuthUser | null) => void;
const listeners: AuthListener[] = [];
let currentUser: AuthUser | null = null;

function notifyAuth(user: AuthUser | null) {
  currentUser = user;
  for (const l of listeners) l(user);
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

function rowToAuthUser(row: any): AuthUser {
  const uid = String(row.id);
  // Profile (name + avatar) is device-local — apply any local overrides.
  const local = localGetProfile(uid);
  return {
    uid,
    name: local?.name ?? String(row.name),
    email: String(row.email),
    emailVerified: true,
    photoURL: local?.avatar ?? (row.avatar ? String(row.avatar) : null),
    createdAt: new Date(Number(row.created_at) || Date.now()).toISOString(),
    lastSignIn: new Date().toISOString(),
    recoveryToken: null,
    contactToken: row.contact_token ? String(row.contact_token) : undefined,
  };
}

export async function signUp(name: string, email: string, password: string): Promise<AuthUser> {
  await ensureSchema();
  const c = dbClient();
  const normEmail = email.toLowerCase().trim();

  // Check email not taken
  const existing = await c.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [normEmail] });
  if (existing.rows.length > 0) throw new Error("An account with this email already exists.");

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const contactToken = await deriveContactToken(id);
  const recoveryToken = generateRecoveryToken();
  const recoveryHash = await sha256(recoveryToken.toUpperCase());
  const avatar = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`;
  const now = Date.now();

  await c.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, salt, avatar, contact_token, recovery_hash, last_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, name, normEmail, passwordHash, salt, avatar, contactToken, recoveryHash, now, now],
  });

  // Create session
  await createSession(id);

  const user: AuthUser = {
    uid: id,
    name,
    email: normEmail,
    emailVerified: true,
    photoURL: avatar,
    createdAt: new Date(now).toISOString(),
    lastSignIn: new Date(now).toISOString(),
    recoveryToken,
    contactToken,
  };
  notifyAuth(user);
  return user;
}

export async function signIn(email: string, password: string, _remember: boolean): Promise<AuthUser> {
  await ensureSchema();
  const c = dbClient();
  const normEmail = email.toLowerCase().trim();

  const res = await c.execute({ sql: "SELECT * FROM users WHERE email = ?", args: [normEmail] });
  if (res.rows.length === 0) throw new Error("No account found with this email.");
  const row: any = res.rows[0];

  const candidateHash = await hashPassword(password, String(row.salt));
  if (candidateHash !== String(row.password_hash)) throw new Error("Incorrect password.");

  await createSession(String(row.id));
  c.execute({ sql: "UPDATE users SET last_active = ? WHERE id = ?", args: [Date.now(), String(row.id)] }).catch(() => {});

  const user = rowToAuthUser(row);
  notifyAuth(user);
  return user;
}

export async function logout(): Promise<void> {
  const token = localStorage.getItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (token) {
    try {
      await ensureSchema();
      await dbClient().execute({ sql: "DELETE FROM sessions WHERE token = ?", args: [token] });
    } catch { /* ignore */ }
  }
  notifyAuth(null);
}

async function createSession(userId: string): Promise<void> {
  const token = randomHex(32);
  const now = Date.now();
  await dbClient().execute({
    sql: "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    args: [token, userId, now, now + 30 * 24 * 3600 * 1000],
  });
  localStorage.setItem(SESSION_KEY, token);
}

async function restoreSession(): Promise<AuthUser | null> {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return null;
  try {
    await ensureSchema();
    const c = dbClient();
    const res = await c.execute({
      sql: `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?`,
      args: [token, Date.now()],
    });
    if (res.rows.length === 0) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const row: any = res.rows[0];
    c.execute({ sql: "UPDATE users SET last_active = ? WHERE id = ?", args: [Date.now(), String(row.id)] }).catch(() => {});
    return rowToAuthUser(row);
  } catch (e) {
    console.warn("Session restore failed:", e);
    return null;
  }
}

export function onAuthChange(cb: AuthListener): () => void {
  listeners.push(cb);
  // Restore session on first subscription
  restoreSession().then((user) => {
    currentUser = user;
    cb(user);
  }).catch(() => cb(null));
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/* ============================ RECOVERY TOKENS ============================ */

export async function verifyRecoveryToken(email: string, token: string): Promise<{ uid: string }> {
  await ensureSchema();
  const normEmail = email.toLowerCase().trim();
  const normToken = token.trim().toUpperCase().replace(/\s/g, "");
  if (!/^NUDGEL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normToken)) {
    throw new Error("Invalid token format. It should look like NUDGEL-XXXX-XXXX-XXXX.");
  }
  const res = await dbClient().execute({ sql: "SELECT id, recovery_hash FROM users WHERE email = ?", args: [normEmail] });
  if (res.rows.length === 0) throw new Error("No account found with this email.");
  const row: any = res.rows[0];
  const providedHash = await sha256(normToken);
  if (providedHash !== String(row.recovery_hash)) throw new Error("Invalid recovery token.");
  return { uid: String(row.id) };
}

export async function resetPasswordWithRecoveryToken(
  email: string,
  token: string,
  newPassword: string
): Promise<{ uid: string; newRecoveryToken: string }> {
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!/[A-Z]/.test(newPassword)) throw new Error("Include at least one uppercase letter.");
  if (!/[0-9]/.test(newPassword)) throw new Error("Include at least one number.");

  const { uid } = await verifyRecoveryToken(email, token);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(newPassword, salt);
  const newRecoveryToken = generateRecoveryToken();
  const newRecoveryHash = await sha256(newRecoveryToken.toUpperCase());

  await dbClient().execute({
    sql: "UPDATE users SET password_hash = ?, salt = ?, recovery_hash = ? WHERE id = ?",
    args: [passwordHash, salt, newRecoveryHash, uid],
  });

  return { uid, newRecoveryToken };
}

export async function regenerateRecoveryToken(currentPassword?: string): Promise<string> {
  const user = currentUser;
  if (!user) throw new Error("You must be signed in to regenerate your token.");
  await ensureSchema();
  const c = dbClient();

  if (currentPassword) {
    const res = await c.execute({ sql: "SELECT password_hash, salt FROM users WHERE id = ?", args: [user.uid] });
    if (res.rows.length === 0) throw new Error("Account not found.");
    const row: any = res.rows[0];
    const candidate = await hashPassword(currentPassword, String(row.salt));
    if (candidate !== String(row.password_hash)) throw new Error("Incorrect password.");
  }

  const newToken = generateRecoveryToken();
  const newHash = await sha256(newToken.toUpperCase());
  await c.execute({ sql: "UPDATE users SET recovery_hash = ? WHERE id = ?", args: [newHash, user.uid] });
  return newToken;
}

/* ============================ PRESENCE ============================ */

const ONLINE_WINDOW_MS = 60_000;

export async function heartbeat(userId: string): Promise<void> {
  try {
    await ensureSchema();
    await dbClient().execute({ sql: "UPDATE users SET last_active = ? WHERE id = ?", args: [Date.now(), userId] });
  } catch { /* ignore */ }
}

export function isOnline(lastActive: number): boolean {
  return Date.now() - lastActive < ONLINE_WINDOW_MS;
}

export function formatLastActive(lastActive: number): string {
  if (isOnline(lastActive)) return "Online";
  if (!lastActive) return "Offline";
  const diff = Date.now() - lastActive;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Last seen ${mins <= 1 ? "1 min" : mins + " mins"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours === 1 ? "1 hour" : hours + " hours"} ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days === 1 ? "1 day" : days + " days"} ago`;
}

/* ============================ CONTACTS ============================ */

export type FoundUser = {
  uid: string;
  name: string;
  email: string;
  avatar: string;
  contactToken: string;
};

export async function findUserByContactToken(token: string): Promise<FoundUser | null> {
  const normalized = token.trim().toUpperCase().replace(/\s/g, "");
  if (!/^MW-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) return null;
  await ensureSchema();
  const res = await dbClient().execute({
    sql: "SELECT id, name, email, avatar, contact_token FROM users WHERE contact_token = ?",
    args: [normalized],
  });
  if (res.rows.length === 0) return null;
  const row: any = res.rows[0];
  return {
    uid: String(row.id),
    name: String(row.name),
    email: String(row.email),
    avatar: String(row.avatar || ""),
    contactToken: String(row.contact_token),
  };
}

/* ============================ CHATS ============================ */

export type ChatSummary = {
  id: string;
  otherUid: string;
  otherName: string;
  otherAvatar: string;
  lastMessage: string;
  lastMessageBy: string;
  updatedAt: number;
  unread: number;
  online: boolean;
  lastActive: number;
};

export async function getOrCreateChat(uidA: string, uidB: string): Promise<string> {
  await ensureSchema();
  const c = dbClient();
  const [u1, u2] = [uidA, uidB].sort();

  const existing = await c.execute({
    sql: "SELECT id FROM chats WHERE user_a = ? AND user_b = ?",
    args: [u1, u2],
  });
  if (existing.rows.length > 0) return String((existing.rows[0] as any).id);

  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await c.execute({
      sql: "INSERT INTO chats (id, user_a, user_b, last_message, last_message_by, updated_at, created_at) VALUES (?, ?, ?, '', '', ?, ?)",
      args: [id, u1, u2, now, now],
    });
  } catch (e: any) {
    // UNIQUE collision means another device created it concurrently — fetch it
    const retry = await c.execute({ sql: "SELECT id FROM chats WHERE user_a = ? AND user_b = ?", args: [u1, u2] });
    if (retry.rows.length > 0) return String((retry.rows[0] as any).id);
    throw e;
  }
  return id;
}

export async function listChats(myUid: string): Promise<ChatSummary[]> {
  await ensureSchema();
  const res = await dbClient().execute({
    sql: `SELECT c.id, c.last_message, c.last_message_by, c.updated_at,
                 u.id AS other_id, u.name AS other_name, u.avatar AS other_avatar, u.last_active AS other_last_active,
                 (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.from_user != ? AND m.read = 0) AS unread
          FROM chats c
          JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
          WHERE c.user_a = ? OR c.user_b = ?
          ORDER BY c.updated_at DESC
          LIMIT 50`,
    args: [myUid, myUid, myUid, myUid],
  });
  return res.rows.map((r: any) => {
    const id = String(r.id);
    // Message previews are driven by the device-local delivery store.
    const meta = localGetChatMeta(id);
    return {
      id,
      otherUid: String(r.other_id),
      otherName: String(r.other_name),
      otherAvatar: String(r.other_avatar || ""),
      lastMessage: meta?.lastMessage ?? String(r.last_message || ""),
      lastMessageBy: meta?.lastMessageBy ?? String(r.last_message_by || ""),
      updatedAt: meta?.updatedAt ?? (Number(r.updated_at) || 0),
      unread: 0,
      online: isOnline(Number(r.other_last_active) || 0),
      lastActive: Number(r.other_last_active) || 0,
    };
  });
}

/* ============================ MESSAGES ============================ */

export type DbMessage = {
  id: string;
  chatId: string;
  from: string;
  text: string;
  createdAt: number;
  status: "sent" | "delivered" | "read";
  read: boolean;
};

export async function sendMessage(chatId: string, fromUid: string, text: string): Promise<void> {
  // Message delivery is device-local — never written to Turso.
  localSendMessage(chatId, fromUid, text);
}

/**
 * Insert a message using a CALLER-SUPPLIED row id and return that id.
 * Used by the social-media URL → media transform pipeline so that the very
 * same row can later be UPDATEd in place (true replacement, never a duplicate).
 */
export async function sendMessageWithId(
  chatId: string,
  fromUid: string,
  text: string,
  id: string,
): Promise<string> {
  // Device-local delivery, preserving the caller-supplied row id.
  return localSendMessage(chatId, fromUid, text, id);
}

/**
 * Replace the text of an EXISTING message row in place. This is the core of the
 * social-media URL → media transform: the original URL row is overwritten with
 * the extracted media marker so the URL never survives as the final message.
 */
export async function editMessageText(
  messageId: string,
  newText: string,
  chatId?: string,
  fromUid?: string,
): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed || !messageId) return;
  // Device-local edit (used by the social-URL → media transform).
  if (chatId) {
    localEditMessage(chatId, messageId, trimmed, fromUid);
  } else {
    localEditMessageAnyChat(messageId, trimmed);
  }
}

/** Delete a single message by ID (deletes for everyone). */
export async function deleteMessage(messageId: string): Promise<void> {
  // Device-local deletion.
  localDeleteMessage(messageId);
}

/** Delete an entire chat and all its messages. */
export async function deleteChat(chatId: string): Promise<void> {
  // Clear the device-local message history for this chat…
  localDeleteChat(chatId);
  // …and remove the chat relationship row from Turso (contact list).
  await ensureSchema();
  await dbClient().execute({
    sql: "DELETE FROM chats WHERE id = ?",
    args: [chatId],
  });
}

/** Fetch messages + mark incoming ones as delivered/read (I'm viewing the chat). */
export async function fetchMessages(chatId: string, myUid: string, markRead: boolean): Promise<DbMessage[]> {
  // Message delivery is device-local — read straight from localStorage.
  return localFetchMessages(chatId, myUid, markRead).map((m) => ({
    id: m.id,
    chatId: m.chatId,
    from: m.from,
    text: m.text,
    createdAt: m.createdAt,
    status: m.status,
    read: m.read,
  }));
}

/* ============================ TYPING INDICATOR ============================ */

export async function setTyping(chatId: string, userId: string): Promise<void> {
  try {
    await ensureSchema();
    await dbClient().execute({
      sql: `INSERT INTO typing (chat_id, user_id, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(chat_id, user_id) DO UPDATE SET updated_at = excluded.updated_at`,
      args: [chatId, userId, Date.now()],
    });
  } catch { /* ignore */ }
}

export async function getTyping(chatId: string, otherUid: string): Promise<boolean> {
  try {
    await ensureSchema();
    const res = await dbClient().execute({
      sql: "SELECT updated_at FROM typing WHERE chat_id = ? AND user_id = ?",
      args: [chatId, otherUid],
    });
    if (res.rows.length === 0) return false;
    return Date.now() - Number((res.rows[0] as any).updated_at) < 4000;
  } catch {
    return false;
  }
}

/* ============================ PROFILE ============================ */

export async function getMyProfile(uid: string): Promise<{ contactToken: string; avatar: string; name: string } | null> {
  // contact_token stays in Turso (it's the sharable identity), but the
  // display name + avatar are read from device-local storage so profile
  // edits never round-trip through Turso.
  try {
    await ensureSchema();
    const res = await dbClient().execute({
      sql: "SELECT name, avatar, contact_token FROM users WHERE id = ?",
      args: [uid],
    });
    if (res.rows.length === 0) return null;
    const row: any = res.rows[0];
    const local = localGetProfile(uid);
    return {
      contactToken: String(row.contact_token),
      avatar: local?.avatar ?? String(row.avatar || ""),
      name: local?.name ?? String(row.name),
    };
  } catch {
    // Even if Turso is unreachable, surface any locally-saved profile.
    const local = localGetProfile(uid);
    if (local) {
      return { contactToken: "", avatar: local.avatar ?? "", name: local.name ?? "" };
    }
    return null;
  }
}

export async function updateProfile(uid: string, updates: { name?: string; avatar?: string }): Promise<void> {
  // Profile is stored on-device only — never written to Turso.
  // (The avatar value may be a cloud-hosted URL from the upload helpers;
  //  we persist just the reference locally, not the binary.)
  localUpdateProfile(uid, updates);
}

/* ============================ SOCIAL NUDGES ============================ */

export type SocialNudge = {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  fontId: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  bgColor: string;
  gradientBg: string;
  borderStyle: string;
  borderRadius: number;
  textShadow: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  glassmorphism: number;
  layoutStyle: string;
  imageUrl?: string;
  imageOpacity?: number;
  imageBlend?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
};

export async function publishSocialNudge(n: SocialNudge): Promise<void> {
  await ensureSchema();
  const c = dbClient();
  const sql = `INSERT INTO nudges (
    id, user_id, user_name, user_avatar, text, font_id, font_size, font_weight,
    text_color, bg_color, gradient_bg, border_style, border_radius, text_shadow,
    text_align, glassmorphism, layout_style, image_url, image_opacity, image_blend,
    created_at, updated_at, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    text = excluded.text, font_id = excluded.font_id, font_size = excluded.font_size,
    font_weight = excluded.font_weight, text_color = excluded.text_color,
    bg_color = excluded.bg_color, gradient_bg = excluded.gradient_bg,
    border_style = excluded.border_style, border_radius = excluded.border_radius,
    text_shadow = excluded.text_shadow, text_align = excluded.text_align,
    glassmorphism = excluded.glassmorphism, layout_style = excluded.layout_style,
    image_url = excluded.image_url, image_opacity = excluded.image_opacity,
    image_blend = excluded.image_blend, updated_at = excluded.updated_at,
    expires_at = excluded.expires_at`;

  await c.execute({
    sql,
    args: [
      n.id, n.userId, n.userName, n.userAvatar || '', n.text, n.fontId, n.fontSize, n.fontWeight,
      n.textColor, n.bgColor, n.gradientBg, n.borderStyle, n.borderRadius, n.textShadow,
      n.textAlign, n.glassmorphism, n.layoutStyle, n.imageUrl || null, n.imageOpacity ?? 1, n.imageBlend || 'normal',
      n.createdAt, n.updatedAt, n.expiresAt
    ]
  });
}

export async function deleteSocialNudge(id: string, userId: string): Promise<void> {
  await ensureSchema();
  await dbClient().execute({
    sql: "DELETE FROM nudges WHERE id = ? AND user_id = ?",
    args: [id, userId]
  });
}

export async function listSocialNudges(): Promise<SocialNudge[]> {
  await ensureSchema();
  const now = Date.now();
  // Fetch non-expired nudges, sorted by updatedAt DESC
  const res = await dbClient().execute({
    sql: "SELECT * FROM nudges WHERE expires_at = 0 OR expires_at > ? ORDER BY updated_at DESC LIMIT 100",
    args: [now]
  });

  return res.rows.map((r: any) => ({
    id: String(r.id),
    userId: String(r.user_id),
    userName: String(r.user_name),
    userAvatar: String(r.user_avatar || ''),
    text: String(r.text || ''),
    fontId: String(r.font_id),
    fontSize: Number(r.font_size) || 26,
    fontWeight: Number(r.font_weight) || 700,
    textColor: String(r.text_color),
    bgColor: String(r.bg_color || ''),
    gradientBg: String(r.gradient_bg || ''),
    borderStyle: String(r.border_style || 'none'),
    borderRadius: Number(r.border_radius) || 20,
    textShadow: String(r.text_shadow || 'none'),
    textAlign: (String(r.text_align) as any) || 'center',
    glassmorphism: Number(r.glassmorphism) || 0,
    layoutStyle: String(r.layout_style || 'standard'),
    imageUrl: r.image_url ? String(r.image_url) : undefined,
    imageOpacity: r.image_opacity != null ? Number(r.image_opacity) : 1,
    imageBlend: r.image_blend ? String(r.image_blend) : 'normal',
    createdAt: Number(r.created_at) || 0,
    updatedAt: Number(r.updated_at) || 0,
    expiresAt: Number(r.expires_at) || 0,
  }));
}

/* ============================ GLIMMER — LOCAL MEMORY ENGINE ============================
 * Glimmer is NOT an AI. It is a memory companion that searches the user's
 * own conversations stored in Turso and presents them beautifully.
 *
 * No LLMs, no external APIs, no network calls beyond Turso itself.
 * It searches the `messages` table directly using keyword LIKE matching
 * across every chat the user is part of.
 * ===================================================================== */

export type MemoryMatch = {
  id: string;
  chatId: string;
  text: string;
  context: string;
  createdAt: number;
  fromMe: boolean;
  /** The other person in the conversation this memory came from. */
  withName: string;
  withAvatar: string;
  /** Relevance score — how many query keywords this message matched. */
  score: number;
};

/**
 * Search every message in the user's conversations for the given keywords.
 *
 *   - Joins messages -> chats so only the user's own conversations are searched.
 *   - Each keyword is matched with a case-insensitive LIKE.
 *   - Results are ranked by how many distinct keywords they contain, then
 *     by recency.
 *
 * Returns up to `limit` matches.
 */
export async function searchUserMessages(args: {
  userId: string;
  keywords: string[];
  limit?: number;
}): Promise<MemoryMatch[]> {
  await ensureSchema();
  const limit = args.limit ?? 12;

  const tokens = args.keywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length >= 2)
    .slice(0, 10);

  if (!tokens.length) return [];

  // OR over each keyword; restrict to chats the user belongs to.
  const likeClauses = tokens.map(() => "LOWER(m.text) LIKE ?").join(" OR ");

  const sql = `
    SELECT m.id, m.chat_id, m.from_user, m.text, m.created_at,
           u.name AS with_name, u.avatar AS with_avatar,
           (
             SELECT p.text FROM messages p
             WHERE p.chat_id = m.chat_id
               AND p.created_at < m.created_at
               AND p.text NOT LIKE '[img]%'
               AND p.text NOT LIKE '[story_%'
               AND p.text NOT LIKE '[nudge]%'
             ORDER BY p.created_at DESC
             LIMIT 1
           ) AS prev_text,
           (
             SELECT n.text FROM messages n
             WHERE n.chat_id = m.chat_id
               AND n.created_at > m.created_at
               AND n.text NOT LIKE '[img]%'
               AND n.text NOT LIKE '[story_%'
               AND n.text NOT LIKE '[nudge]%'
             ORDER BY n.created_at ASC
             LIMIT 1
           ) AS next_text
    FROM messages m
    JOIN chats c ON c.id = m.chat_id
    JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
    WHERE (c.user_a = ? OR c.user_b = ?)
      AND (${likeClauses})
    ORDER BY m.created_at DESC
    LIMIT 80`;

  const res = await dbClient().execute({
    sql,
    args: [args.userId, args.userId, args.userId, ...tokens.map((t) => `%${t}%`)],
  });

  const matches: MemoryMatch[] = res.rows
    .map((r: any) => {
      const text = String(r.text || "");
      const lower = text.toLowerCase();
      // Skip non-text payloads (images, stories, nudges).
      if (
        lower.startsWith("[img]") ||
        lower.startsWith("[story_") ||
        lower.startsWith("[nudge]")
      ) {
        return null;
      }
      const score = tokens.reduce((acc, t) => (lower.includes(t) ? acc + 1 : acc), 0);
      return {
        id: String(r.id),
        chatId: String(r.chat_id),
        text,
        context: [String(r.prev_text || ''), String(r.next_text || '')]
          .filter(Boolean)
          .join(' / '),
        createdAt: Number(r.created_at) || 0,
        fromMe: String(r.from_user) === args.userId,
        withName: String(r.with_name || "someone"),
        withAvatar: String(r.with_avatar || ""),
        score,
      } as MemoryMatch;
    })
    .filter((m): m is MemoryMatch => m !== null && m.score > 0);

  // Rank: more keyword hits first, then most recent.
  matches.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);

  return matches.slice(0, limit);
}

/**
 * Recent text messages across all the user's conversations — used to power
 * Glimmer's Memory Timeline, Important Moments, Funny Moments and
 * Friendship Highlights on the full-screen Home world.
 */
export async function recentUserMessages(args: {
  userId: string;
  limit?: number;
}): Promise<MemoryMatch[]> {
  await ensureSchema();
  const limit = args.limit ?? 60;
  const res = await dbClient().execute({
    sql: `
      SELECT m.id, m.chat_id, m.from_user, m.text, m.created_at,
             u.name AS with_name, u.avatar AS with_avatar
      FROM messages m
      JOIN chats c ON c.id = m.chat_id
      JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
      WHERE (c.user_a = ? OR c.user_b = ?)
      ORDER BY m.created_at DESC
      LIMIT 200`,
    args: [args.userId, args.userId, args.userId],
  });

  return res.rows
    .map((r: any) => {
      const text = String(r.text || "");
      const lower = text.toLowerCase();
      if (
        lower.startsWith("[img]") ||
        lower.startsWith("[story_") ||
        lower.startsWith("[nudge]")
      ) {
        return null;
      }
      return {
        id: String(r.id),
        chatId: String(r.chat_id),
        text,
        context: '',
        createdAt: Number(r.created_at) || 0,
        fromMe: String(r.from_user) === args.userId,
        withName: String(r.with_name || "someone"),
        withAvatar: String(r.with_avatar || ""),
        score: 0,
      } as MemoryMatch;
    })
    .filter((m): m is MemoryMatch => m !== null)
    .slice(0, limit);
}

/* ============================ GROUP CHAT SYSTEM ============================ */
// ── Types ───────────────────────────────────────────────────
export type GroupRole = "owner" | "admin" | "member";
export type GroupTag = { id: string; groupId: string; name: string; color: string; createdBy: string; createdAt: number };
export type GroupMember = {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  role: GroupRole;
  joinedAt: number;
  nickname?: string | null;
  muted: boolean;
  tags: GroupTag[];
  online: boolean;
  lastActive: number;
};
export type GroupInfo = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  memberCount: number;
  inviteCode: string;
  isPublic: boolean;
  myRole: GroupRole;
};
export type GroupMessage = {
  id: string;
  groupId: string;
  from: string;
  fromName: string;
  fromAvatar: string;
  text: string;
  replyTo?: string | null;
  createdAt: number;
  editedAt?: number;
  deleted: boolean;
  reactions: { emoji: string; count: number; me: boolean; users: string[] }[];
  readByCount: number;
};
export type GroupPin = { messageId: string; pinnedBy: string; pinnedAt: number; messageText: string; fromName: string };
export type GroupLogEntry = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId?: string | null;
  targetName?: string | null;
  details: string;
  createdAt: number;
};
export type GroupContactCandidate = {
  uid: string;
  name: string;
  email: string;
  avatar: string;
  contactToken: string;
  username: string;
  online: boolean;
  lastActive: number;
};

type GroupAccess = {
  id: string;
  name: string;
  ownerId: string;
  role: GroupRole | null;
};

// ── Helpers ────────────────────────────────────────────────
function genGroupInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `NG-${seg()}-${seg()}-${seg()}`;
}

function isGroupAdminRole(role: GroupRole | null | undefined): role is "owner" | "admin" {
  return role === "owner" || role === "admin";
}

function usernameFromEmail(email: string): string {
  const base = (email.split("@")[0] || "user").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24);
  return `@${base || "user"}`;
}

async function logGroupAction(
  groupId: string,
  actorId: string,
  actorName: string,
  action: string,
  targetId?: string | null,
  targetName?: string | null,
  details?: string
) {
  try {
    await ensureSchema();
    await dbClient().execute({
      sql: `INSERT INTO group_admin_log (id, group_id, actor_id, actor_name, action, target_id, target_name, details, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [crypto.randomUUID(), groupId, actorId, actorName, action, targetId || null, targetName || null, details || "", Date.now()],
    });
  } catch {}
}

async function getGroupAccess(groupId: string, userId: string): Promise<GroupAccess | null> {
  await ensureSchema();
  const res = await dbClient().execute({
    sql: `SELECT g.id, g.name, g.owner_id, gm.role AS my_role
          FROM groups g
          LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
          WHERE g.id = ?
          LIMIT 1`,
    args: [userId, groupId],
  });
  if (res.rows.length === 0) return null;
  const row: any = res.rows[0];
  return {
    id: String(row.id),
    name: String(row.name),
    ownerId: String(row.owner_id),
    role: row.my_role ? (String(row.my_role) as GroupRole) : null,
  };
}

async function requireGroupMember(groupId: string, userId: string): Promise<{ id: string; name: string; ownerId: string; role: GroupRole }> {
  const access = await getGroupAccess(groupId, userId);
  if (!access || !access.role) throw new Error("You are no longer a member of this group.");
  return { id: access.id, name: access.name, ownerId: access.ownerId, role: access.role };
}

async function requireGroupAdmin(groupId: string, userId: string): Promise<{ id: string; name: string; ownerId: string; role: "owner" | "admin" }> {
  const access = await requireGroupMember(groupId, userId);
  if (!isGroupAdminRole(access.role)) throw new Error("Only group admins can do that.");
  return { ...access, role: access.role };
}

async function requireGroupOwner(groupId: string, userId: string): Promise<{ id: string; name: string; ownerId: string; role: "owner" }> {
  const access = await requireGroupMember(groupId, userId);
  if (access.role !== "owner") throw new Error("Only the group owner can do that.");
  return { ...access, role: "owner" as const };
}

async function getGroupMemberRow(groupId: string, userId: string): Promise<{ userId: string; role: GroupRole; name: string } | null> {
  await ensureSchema();
  const res = await dbClient().execute({
    sql: `SELECT gm.user_id, gm.role, u.name
          FROM group_members gm
          JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = ? AND gm.user_id = ?
          LIMIT 1`,
    args: [groupId, userId],
  });
  if (!res.rows.length) return null;
  const row: any = res.rows[0];
  return { userId: String(row.user_id), role: String(row.role) as GroupRole, name: String(row.name) };
}

async function postGroupSystemMessage(groupId: string, fromUid: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const now = Date.now();
  await dbClient().batch([
    {
      sql: "INSERT INTO group_messages (id, group_id, from_user, text, reply_to, created_at, edited_at, deleted) VALUES (?, ?, ?, ?, NULL, ?, 0, 0)",
      args: [crypto.randomUUID(), groupId, fromUid, trimmed, now],
    },
    {
      sql: "UPDATE groups SET message_count = message_count + 1, updated_at = ? WHERE id = ?",
      args: [now, groupId],
    },
  ], "write");
}

async function deleteGroupInternal(groupId: string): Promise<void> {
  const c = dbClient();
  await c.batch([
    { sql: "DELETE FROM group_message_reads WHERE message_id IN (SELECT id FROM group_messages WHERE group_id = ?)", args: [groupId] },
    { sql: "DELETE FROM group_message_reactions WHERE message_id IN (SELECT id FROM group_messages WHERE group_id = ?)", args: [groupId] },
    { sql: "DELETE FROM group_pins WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_admin_log WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_bans WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_member_tags WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_tags WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_members WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM group_messages WHERE group_id = ?", args: [groupId] },
    { sql: "DELETE FROM groups WHERE id = ?", args: [groupId] },
  ], "write");
}

// ── Groups ─────────────────────────────────────────────────
export async function createGroup(args: {
  ownerId: string;
  ownerName: string;
  name: string;
  description?: string;
  iconUrl?: string | null;
  memberIds: string[];
}): Promise<string> {
  await ensureSchema();
  const c = dbClient();
  const id = "grp_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = Date.now();
  const inviteCode = genGroupInviteCode();
  const allMembers = Array.from(new Set([args.ownerId, ...args.memberIds]));
  await c.batch([
    {
      sql: `INSERT INTO groups (id, name, description, icon_url, owner_id, created_at, updated_at, message_count, member_count, invite_code, is_public)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0)`,
      args: [id, args.name.trim(), args.description?.trim() || "", args.iconUrl || null, args.ownerId, now, now, allMembers.length, inviteCode],
    },
    ...allMembers.map((uid, i) => ({
      sql: `INSERT INTO group_members (group_id, user_id, role, joined_at, invited_by)
            VALUES (?, ?, ?, ?, ?)`,
      args: [id, uid, uid === args.ownerId ? "owner" : "member", now + i, args.ownerId],
    })),
  ], "write");
  await logGroupAction(id, args.ownerId, args.ownerName, "group_created", null, null, args.name);
  return id;
}

export async function listGroupChats(myUid: string): Promise<(ChatSummary & { isGroup: true; groupInfo: GroupInfo })[]> {
  await ensureSchema();
  const res = await dbClient().execute({
    sql: `SELECT g.id, g.name, g.description, g.icon_url, g.owner_id, g.created_at, g.updated_at, g.message_count, g.member_count, g.invite_code, g.is_public,
                 gm.role AS my_role,
                 COALESCE((SELECT text FROM group_messages m WHERE m.group_id = g.id AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 1), '') AS last_message,
                 COALESCE((SELECT from_user FROM group_messages m WHERE m.group_id = g.id AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 1), '') AS last_message_by,
                 COALESCE((SELECT created_at FROM group_messages m WHERE m.group_id = g.id AND m.deleted = 0 ORDER BY m.created_at DESC LIMIT 1), g.updated_at) AS last_ts,
                 (SELECT COUNT(*) FROM group_messages gm2 WHERE gm2.group_id = g.id AND gm2.created_at > COALESCE((SELECT MAX(gmr.read_at)
                   FROM group_message_reads gmr
                   JOIN group_messages gm4 ON gm4.id = gmr.message_id
                   WHERE gm4.group_id = g.id AND gmr.user_id = ?), 0) AND gm2.from_user != ?) AS unread
          FROM groups g
          JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
          LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
          ORDER BY last_ts DESC`,
    args: [myUid, myUid, myUid, myUid],
  });
  return (res.rows as any[]).map((r) => ({
    id: String(r.id),
    otherUid: String(r.id),
    otherName: String(r.name),
    otherAvatar: r.icon_url ? String(r.icon_url) : "",
    lastMessage: String(r.last_message || ""),
    lastMessageBy: String(r.last_message_by || ""),
    updatedAt: Number(r.last_ts) || Number(r.updated_at) || 0,
    unread: Number(r.unread) || 0,
    online: true,
    lastActive: Date.now(),
    isGroup: true as const,
    groupInfo: {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description || ""),
      iconUrl: r.icon_url ? String(r.icon_url) : null,
      ownerId: String(r.owner_id),
      createdAt: Number(r.created_at) || 0,
      updatedAt: Number(r.updated_at) || 0,
      messageCount: Number(r.message_count) || 0,
      memberCount: Number(r.member_count) || 0,
      inviteCode: String(r.invite_code || ""),
      isPublic: Number(r.is_public) === 1,
      myRole: (String(r.my_role) as GroupRole) || "member",
    },
  }));
}

export async function getGroupInfo(groupId: string, myUid: string): Promise<GroupInfo | null> {
  await ensureSchema();
  const res = await dbClient().execute({
    sql: `SELECT g.*, gm.role AS my_role FROM groups g
          LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
          WHERE g.id = ?`,
    args: [myUid, groupId],
  });
  if (res.rows.length === 0) return null;
  const r: any = res.rows[0];
  if (!r.my_role) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description || ""),
    iconUrl: r.icon_url ? String(r.icon_url) : null,
    ownerId: String(r.owner_id),
    createdAt: Number(r.created_at) || 0,
    updatedAt: Number(r.updated_at) || 0,
    messageCount: Number(r.message_count) || 0,
    memberCount: Number(r.member_count) || 0,
    inviteCode: String(r.invite_code || ""),
    isPublic: Number(r.is_public) === 1,
    myRole: String(r.my_role) as GroupRole,
  };
}

export async function listGroupMembers(groupId: string, requesterId: string): Promise<GroupMember[]> {
  await requireGroupMember(groupId, requesterId);
  const res = await dbClient().execute({
    sql: `SELECT gm.user_id, gm.role, gm.joined_at, gm.nickname, gm.muted,
                 u.name, u.email, u.avatar, u.last_active
          FROM group_members gm
          JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = ?
          ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.name ASC
          LIMIT 5000`,
    args: [groupId],
  });
  const members = (res.rows as any[]).map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    avatar: String(r.avatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(String(r.name))}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`),
    role: String(r.role) as GroupRole,
    joinedAt: Number(r.joined_at) || 0,
    nickname: r.nickname ? String(r.nickname) : null,
    muted: Number(r.muted) === 1,
    tags: [] as GroupTag[],
    online: Date.now() - Number(r.last_active || 0) < 60000,
    lastActive: Number(r.last_active) || 0,
  }));
  if (members.length) {
    const tagRes = await dbClient().execute({
      sql: `SELECT gmt.user_id, t.id, t.name, t.color, t.created_by, t.created_at
            FROM group_member_tags gmt
            JOIN group_tags t ON t.id = gmt.tag_id
            WHERE gmt.group_id = ?`,
      args: [groupId],
    });
    const tagMap = new Map<string, GroupTag[]>();
    for (const tr of tagRes.rows as any[]) {
      const uid = String(tr.user_id);
      if (!tagMap.has(uid)) tagMap.set(uid, []);
      tagMap.get(uid)!.push({
        id: String(tr.id), groupId, name: String(tr.name), color: String(tr.color),
        createdBy: String(tr.created_by), createdAt: Number(tr.created_at) || 0,
      });
    }
    for (const m of members) m.tags = tagMap.get(m.userId) || [];
  }
  return members;
}

export async function listGroupEligibleContacts(groupId: string, requesterId: string): Promise<GroupContactCandidate[]> {
  await requireGroupAdmin(groupId, requesterId);
  const res = await dbClient().execute({
    sql: `SELECT u.id, u.name, u.email, u.avatar, u.contact_token, u.last_active
          FROM chats c
          JOIN users u ON u.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
          WHERE (c.user_a = ? OR c.user_b = ?)
            AND u.id != ?
            AND u.id NOT IN (SELECT gm.user_id FROM group_members gm WHERE gm.group_id = ?)
          ORDER BY u.name ASC
          LIMIT 500`,
    args: [requesterId, requesterId, requesterId, requesterId, groupId],
  });
  return (res.rows as any[]).map((row) => ({
    uid: String(row.id),
    name: String(row.name),
    email: String(row.email),
    avatar: String(row.avatar || `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(String(row.name))}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`),
    contactToken: String(row.contact_token || ""),
    username: usernameFromEmail(String(row.email || "")),
    online: Date.now() - Number(row.last_active || 0) < 60000,
    lastActive: Number(row.last_active) || 0,
  }));
}

export async function updateGroupProfile(groupId: string, actorId: string, actorName: string, patch: { name?: string; description?: string; iconUrl?: string | null }): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  const sets: string[] = [];
  const args: any[] = [];
  if (patch.name !== undefined) { sets.push("name = ?"); args.push(patch.name.trim()); }
  if (patch.description !== undefined) { sets.push("description = ?"); args.push(patch.description.trim()); }
  if (patch.iconUrl !== undefined) { sets.push("icon_url = ?"); args.push(patch.iconUrl); }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  args.push(Date.now(), groupId);
  await dbClient().execute({ sql: `UPDATE groups SET ${sets.join(", ")} WHERE id = ?`, args });
  if (patch.name !== undefined) await logGroupAction(groupId, actorId, actorName, "name_changed", null, null, patch.name.trim());
  if (patch.description !== undefined) await logGroupAction(groupId, actorId, actorName, "description_changed", null, null, patch.description.trim());
  if (patch.iconUrl !== undefined) await logGroupAction(groupId, actorId, actorName, "icon_changed", null, null, patch.iconUrl || "removed");
}

export async function setGroupMemberRole(groupId: string, actorId: string, actorName: string, targetUid: string, targetName: string, role: GroupRole): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  if (role === "owner") throw new Error("Ownership transfer is not supported here.");
  if (targetUid === actorId) throw new Error("Use Leave Group instead.");
  const target = await getGroupMemberRow(groupId, targetUid);
  if (!target) throw new Error("That member is no longer in the group.");
  if (target.role === "owner") throw new Error("The group owner cannot be changed here.");
  await dbClient().execute({
    sql: "UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?",
    args: [role, groupId, targetUid],
  });
  await dbClient().execute({ sql: "UPDATE groups SET updated_at = ? WHERE id = ?", args: [Date.now(), groupId] });
  await logGroupAction(groupId, actorId, actorName, role === "admin" ? "promoted_admin" : "demoted_member", targetUid, targetName, role);
  await postGroupSystemMessage(groupId, actorId, role === "admin" ? `${actorName} made ${targetName} an admin.` : `${actorName} removed admin rights from ${targetName}.`);
}

export async function removeGroupMember(groupId: string, actorId: string, actorName: string, targetUid: string, targetName: string): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  if (targetUid === actorId) throw new Error("Use Leave Group to remove yourself.");
  const target = await getGroupMemberRow(groupId, targetUid);
  if (!target) throw new Error("That member is no longer in the group.");
  if (target.role === "owner") throw new Error("The group owner cannot be removed.");
  const now = Date.now();
  await postGroupSystemMessage(groupId, actorId, `${actorName} removed ${targetName} from the group.`);
  await dbClient().batch([
    { sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [groupId, targetUid] },
    { sql: "DELETE FROM group_member_tags WHERE group_id = ? AND user_id = ?", args: [groupId, targetUid] },
    { sql: "UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?), updated_at = ? WHERE id = ?", args: [groupId, now, groupId] },
  ], "write");
  await logGroupAction(groupId, actorId, actorName, "member_removed", targetUid, targetName, "");
}

export async function banGroupMember(groupId: string, actorId: string, actorName: string, targetUid: string, targetName: string, reason = ""): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  const target = await getGroupMemberRow(groupId, targetUid);
  if (!target) throw new Error("That member is no longer in the group.");
  if (target.role === "owner") throw new Error("The group owner cannot be banned.");
  const now = Date.now();
  await dbClient().batch([
    { sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [groupId, targetUid] },
    { sql: "DELETE FROM group_member_tags WHERE group_id = ? AND user_id = ?", args: [groupId, targetUid] },
    { sql: "INSERT OR REPLACE INTO group_bans (group_id, user_id, banned_by, reason, banned_at) VALUES (?, ?, ?, ?, ?)", args: [groupId, targetUid, actorId, reason, now] },
    { sql: "UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?), updated_at = ? WHERE id = ?", args: [groupId, now, groupId] },
  ], "write");
  await logGroupAction(groupId, actorId, actorName, "member_banned", targetUid, targetName, reason);
}

export async function addGroupMembers(groupId: string, actorId: string, actorName: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await requireGroupAdmin(groupId, actorId);
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean))).filter((id) => id !== actorId);
  if (!uniqueIds.length) return;
  const marks = uniqueIds.map(() => "?").join(",");
  const existingRes = await dbClient().execute({
    sql: `SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN (${marks})`,
    args: [groupId, ...uniqueIds],
  });
  const bannedRes = await dbClient().execute({
    sql: `SELECT user_id FROM group_bans WHERE group_id = ? AND user_id IN (${marks})`,
    args: [groupId, ...uniqueIds],
  });
  const existing = new Set((existingRes.rows as any[]).map((r) => String(r.user_id)));
  const banned = new Set((bannedRes.rows as any[]).map((r) => String(r.user_id)));
  const finalIds = uniqueIds.filter((id) => !existing.has(id) && !banned.has(id));
  if (!finalIds.length) return;
  const namesRes = await dbClient().execute({
    sql: `SELECT id, name FROM users WHERE id IN (${finalIds.map(() => "?").join(",")})`,
    args: finalIds,
  });
  const names = new Map((namesRes.rows as any[]).map((r) => [String(r.id), String(r.name)]));
  const now = Date.now();
  const ops = finalIds.map((uid, i) => ({
    sql: "INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at, invited_by) VALUES (?, ?, 'member', ?, ?)",
    args: [groupId, uid, now + i, actorId],
  }));
  ops.push({ sql: "UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?), updated_at = ? WHERE id = ?", args: [groupId, now, groupId] });
  await dbClient().batch(ops, "write");
  const addedNames = finalIds.map((id) => names.get(id) || "Member");
  await postGroupSystemMessage(groupId, actorId, `${actorName} added ${addedNames.join(", ")}.`);
  await logGroupAction(groupId, actorId, actorName, "members_added", null, null, `${finalIds.length} member(s)`);
}

export async function leaveGroup(groupId: string, actorId: string, actorName: string): Promise<void> {
  const access = await requireGroupMember(groupId, actorId);
  const c = dbClient();
  const remainingRes = await c.execute({
    sql: `SELECT gm.user_id, gm.role, gm.joined_at, u.name
          FROM group_members gm
          JOIN users u ON u.id = gm.user_id
          WHERE gm.group_id = ? AND gm.user_id != ?
          ORDER BY CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END, gm.joined_at ASC`,
    args: [groupId, actorId],
  });
  const remaining = (remainingRes.rows as any[]).map((r) => ({
    userId: String(r.user_id),
    role: String(r.role) as GroupRole,
    joinedAt: Number(r.joined_at) || 0,
    name: String(r.name),
  }));

  if (access.role === "owner" && remaining.length === 0) {
    await deleteGroupInternal(groupId);
    return;
  }

  await postGroupSystemMessage(groupId, actorId, `${actorName} left the group.`);

  const ops: Array<{ sql: string; args: any[] }> = [
    { sql: "DELETE FROM group_members WHERE group_id = ? AND user_id = ?", args: [groupId, actorId] },
    { sql: "DELETE FROM group_member_tags WHERE group_id = ? AND user_id = ?", args: [groupId, actorId] },
  ];

  if (access.role === "owner") {
    const successor = remaining[0];
    ops.push({ sql: "UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", args: [groupId, successor.userId] });
    ops.push({ sql: "UPDATE groups SET owner_id = ?, member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?), updated_at = ? WHERE id = ?", args: [successor.userId, groupId, Date.now(), groupId] });
    await c.batch(ops, "write");
    await postGroupSystemMessage(groupId, successor.userId, `${successor.name} is now the group owner.`);
    await logGroupAction(groupId, actorId, actorName, "owner_left", successor.userId, successor.name, "ownership transferred");
  } else {
    ops.push({ sql: "UPDATE groups SET member_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ?), updated_at = ? WHERE id = ?", args: [groupId, Date.now(), groupId] });
    await c.batch(ops, "write");
    await logGroupAction(groupId, actorId, actorName, "member_left", actorId, actorName, "");
  }
}

export async function deleteGroup(groupId: string, actorId: string, actorName: string): Promise<void> {
  await requireGroupOwner(groupId, actorId);
  await logGroupAction(groupId, actorId, actorName, "group_deleted", null, null, "");
  await deleteGroupInternal(groupId);
}

// ── Tags ───────────────────────────────────────────────────
export async function listGroupTags(groupId: string, requesterId: string): Promise<GroupTag[]> {
  await requireGroupMember(groupId, requesterId);
  const res = await dbClient().execute({ sql: "SELECT * FROM group_tags WHERE group_id = ? ORDER BY name ASC", args: [groupId] });
  return (res.rows as any[]).map(r => ({
    id: String(r.id), groupId, name: String(r.name), color: String(r.color),
    createdBy: String(r.created_by), createdAt: Number(r.created_at) || 0,
  }));
}

export async function createGroupTag(groupId: string, actorId: string, actorName: string, name: string, color: string): Promise<string> {
  await requireGroupAdmin(groupId, actorId);
  const id = "tag_" + crypto.randomUUID().replace(/-/g, "").slice(0, 14);
  await dbClient().execute({
    sql: "INSERT INTO group_tags (id, group_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, groupId, name.trim(), color, actorId, Date.now()],
  });
  await logGroupAction(groupId, actorId, actorName, "tag_created", null, name, color);
  return id;
}

export async function deleteGroupTag(groupId: string, actorId: string, actorName: string, tagId: string, tagName: string): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  const c = dbClient();
  await c.batch([
    { sql: "DELETE FROM group_member_tags WHERE tag_id = ? AND group_id = ?", args: [tagId, groupId] },
    { sql: "DELETE FROM group_tags WHERE id = ? AND group_id = ?", args: [tagId, groupId] },
  ], "write");
  await logGroupAction(groupId, actorId, actorName, "tag_deleted", tagId, tagName, "");
}

export async function assignMemberTag(groupId: string, actorId: string, actorName: string, userId: string, userName: string, tagId: string, tagName: string): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  await dbClient().execute({
    sql: "INSERT OR IGNORE INTO group_member_tags (group_id, user_id, tag_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?, ?)",
    args: [groupId, userId, tagId, actorId, Date.now()],
  });
  await logGroupAction(groupId, actorId, actorName, "tag_assigned", userId, userName, tagName);
}

export async function removeMemberTag(groupId: string, actorId: string, actorName: string, userId: string, userName: string, tagId: string): Promise<void> {
  await requireGroupAdmin(groupId, actorId);
  await dbClient().execute({ sql: "DELETE FROM group_member_tags WHERE group_id = ? AND user_id = ? AND tag_id = ?", args: [groupId, userId, tagId] });
  await logGroupAction(groupId, actorId, actorName, "tag_removed", userId, userName, tagId);
}

// ── Group messages ─────────────────────────────────────────
export async function sendGroupMessage(groupId: string, fromUid: string, text: string, replyTo?: string | null): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  await requireGroupMember(groupId, fromUid);
  const id = crypto.randomUUID();
  const now = Date.now();
  const c = dbClient();
  await c.batch([
    { sql: "INSERT INTO group_messages (id, group_id, from_user, text, reply_to, created_at, edited_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0, 0)", args: [id, groupId, fromUid, trimmed, replyTo || null, now] },
    { sql: "UPDATE groups SET message_count = message_count + 1, updated_at = ? WHERE id = ?", args: [now, groupId] },
  ], "write");
  return id;
}

export type GroupMessageRow = {
  id: string; groupId: string; fromUid: string; fromName: string; fromAvatar: string;
  text: string; replyTo: string | null; createdAt: number; editedAt: number; deleted: boolean;
};
export async function fetchGroupMessages(groupId: string, myUid: string, limit = 200): Promise<GroupMessageRow[]> {
  await requireGroupMember(groupId, myUid);
  const c = dbClient();
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const res = await c.execute({
    sql: `SELECT gm.id, gm.group_id, gm.from_user, gm.text, gm.reply_to, gm.created_at, gm.edited_at, gm.deleted,
                 u.name AS from_name, u.avatar AS from_avatar
          FROM group_messages gm
          JOIN users u ON u.id = gm.from_user
          WHERE gm.group_id = ?
          ORDER BY gm.created_at ASC
          LIMIT ?`,
    args: [groupId, safeLimit],
  });
  const rows = (res.rows as any[]).map(r => ({
    id: String(r.id), groupId: String(r.group_id), fromUid: String(r.from_user),
    fromName: String(r.from_name), fromAvatar: String(r.from_avatar || ""),
    text: String(r.text), replyTo: r.reply_to ? String(r.reply_to) : null,
    createdAt: Number(r.created_at) || 0, editedAt: Number(r.edited_at) || 0, deleted: Number(r.deleted) === 1,
  }));

  const unreadIds = rows.filter((r) => r.fromUid !== myUid && !r.deleted).map((r) => r.id);
  if (unreadIds.length) {
    const now = Date.now();
    await c.batch(unreadIds.map((id) => ({
      sql: `INSERT INTO group_message_reads (message_id, user_id, read_at)
            VALUES (?, ?, ?)
            ON CONFLICT(message_id, user_id) DO UPDATE SET read_at = excluded.read_at`,
      args: [id, myUid, now],
    })), "write");
  }

  return rows;
}

export async function deleteGroupMessage(messageId: string, actorUid: string): Promise<void> {
  await ensureSchema();
  const c = dbClient();
  const lookup = await c.execute({
    sql: `SELECT gm.id, gm.group_id, gm.from_user
          FROM group_messages gm
          WHERE gm.id = ?
          LIMIT 1`,
    args: [messageId],
  });
  if (!lookup.rows.length) return;
  const row: any = lookup.rows[0];
  const groupId = String(row.group_id);
  const access = await requireGroupMember(groupId, actorUid);
  const isMine = String(row.from_user) === actorUid;
  const canModerate = access.role === "owner" || access.role === "admin";
  if (!isMine && !canModerate) throw new Error("You do not have permission to delete that message.");
  await c.execute({ sql: "UPDATE group_messages SET deleted = 1, text = '[removed]' WHERE id = ?", args: [messageId] });
}

export async function toggleGroupMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  await ensureSchema();
  const c = dbClient();
  const groupRes = await c.execute({ sql: "SELECT group_id FROM group_messages WHERE id = ? LIMIT 1", args: [messageId] });
  if (!groupRes.rows.length) throw new Error("Message not found.");
  await requireGroupMember(String((groupRes.rows[0] as any).group_id), userId);
  const existing = await c.execute({ sql: "SELECT 1 FROM group_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", args: [messageId, userId, emoji] });
  if (existing.rows.length) {
    await c.execute({ sql: "DELETE FROM group_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", args: [messageId, userId, emoji] });
  } else {
    await c.execute({ sql: "INSERT INTO group_message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)", args: [messageId, userId, emoji, Date.now()] });
  }
}

export async function getGroupMessageReactions(messageIds: string[], myUid: string): Promise<Record<string, { emoji: string; count: number; me: boolean; users: string[] }[]>> {
  if (!messageIds.length) return {};
  await ensureSchema();
  const c = dbClient();
  const firstRes = await c.execute({ sql: "SELECT group_id FROM group_messages WHERE id = ? LIMIT 1", args: [messageIds[0]] });
  if (!firstRes.rows.length) return {};
  await requireGroupMember(String((firstRes.rows[0] as any).group_id), myUid);
  const qmarks = messageIds.map(() => "?").join(",");
  const res = await c.execute({
    sql: `SELECT message_id, emoji, user_id FROM group_message_reactions WHERE message_id IN (${qmarks})`,
    args: messageIds,
  });
  const map: Record<string, Record<string, { users: string[]; me: boolean }>> = {};
  for (const r of res.rows as any[]) {
    const mid = String(r.message_id), em = String(r.emoji), uid = String(r.user_id);
    if (!map[mid]) map[mid] = {};
    if (!map[mid][em]) map[mid][em] = { users: [], me: false };
    map[mid][em].users.push(uid);
    if (uid === myUid) map[mid][em].me = true;
  }
  const out: Record<string, { emoji: string; count: number; me: boolean; users: string[] }[]> = {};
  for (const mid of Object.keys(map)) {
    out[mid] = Object.entries(map[mid]).map(([emojiValue, v]) => ({ emoji: emojiValue, count: v.users.length, me: v.me, users: v.users }));
  }
  return out;
}

export async function pinGroupMessage(groupId: string, messageId: string, byUid: string): Promise<void> {
  await requireGroupAdmin(groupId, byUid);
  await dbClient().execute({ sql: "INSERT OR IGNORE INTO group_pins (group_id, message_id, pinned_by, pinned_at) VALUES (?, ?, ?, ?)", args: [groupId, messageId, byUid, Date.now()] });
}
export async function unpinGroupMessage(groupId: string, messageId: string, byUid: string): Promise<void> {
  await requireGroupAdmin(groupId, byUid);
  await dbClient().execute({ sql: "DELETE FROM group_pins WHERE group_id = ? AND message_id = ?", args: [groupId, messageId] });
}
export async function listGroupPins(groupId: string, requesterId: string): Promise<GroupPin[]> {
  await requireGroupMember(groupId, requesterId);
  const res = await dbClient().execute({
    sql: `SELECT gp.message_id, gp.pinned_by, gp.pinned_at,
                 gm.text AS message_text, u.name AS from_name
          FROM group_pins gp
          JOIN group_messages gm ON gm.id = gp.message_id
          JOIN users u ON u.id = gm.from_user
          WHERE gp.group_id = ?
          ORDER BY gp.pinned_at DESC`,
    args: [groupId],
  });
  return (res.rows as any[]).map(r => ({
    messageId: String(r.message_id), pinnedBy: String(r.pinned_by), pinnedAt: Number(r.pinned_at) || 0,
    messageText: String(r.message_text), fromName: String(r.from_name),
  }));
}

export async function listGroupAdminLog(groupId: string, requesterId: string, limit = 80): Promise<GroupLogEntry[]> {
  await requireGroupMember(groupId, requesterId);
  const res = await dbClient().execute({
    sql: "SELECT * FROM group_admin_log WHERE group_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [groupId, limit],
  });
  return (res.rows as any[]).map(r => ({
    id: String(r.id), actorId: String(r.actor_id), actorName: String(r.actor_name),
    action: String(r.action), targetId: r.target_id ? String(r.target_id) : null,
    targetName: r.target_name ? String(r.target_name) : null,
    details: String(r.details || ""), createdAt: Number(r.created_at) || 0,
  }));
}
