/**
 * ════════════════════════════════════════════════════════════════
 *  LOCAL STORE — device-local message delivery + profile persistence
 *  ────────────────────────────────────────────────────────────────
 *  Message delivery and the local user profile are kept entirely in
 *  localStorage on this device. Nothing about the message body or the
 *  profile fields is written to Turso.
 *
 *  IMPORTANT: media files (photos / videos sent to another person) are
 *  still uploaded to cloud storage by the upload helpers BEFORE they
 *  reach here — only the resulting URL travels through the message
 *  text, so this local layer never touches the actual binary media.
 * ════════════════════════════════════════════════════════════════ */

export type LocalMessage = {
  id: string;
  chatId: string;
  from: string;
  text: string;
  createdAt: number;
  status: 'sent' | 'delivered' | 'read';
  read: boolean;
  deleted?: boolean;
};

const MSG_KEY = 'nudgel_local_messages_v1';
const CHATMETA_KEY = 'nudgel_local_chatmeta_v1';
const PROFILE_KEY = 'nudgel_local_profile_v1';

/* ── low-level JSON helpers ─────────────────────────────────────── */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / SSR — ignore */
  }
}

/* ── messages ───────────────────────────────────────────────────── */
type MsgMap = Record<string, LocalMessage[]>; // chatId → messages

function allMessages(): MsgMap {
  return readJson<MsgMap>(MSG_KEY, {});
}
function saveMessages(map: MsgMap): void {
  writeJson(MSG_KEY, map);
}

export type LocalChatMeta = {
  lastMessage: string;
  lastMessageBy: string;
  updatedAt: number;
};
type ChatMetaMap = Record<string, LocalChatMeta>;

function allChatMeta(): ChatMetaMap {
  return readJson<ChatMetaMap>(CHATMETA_KEY, {});
}
function saveChatMeta(map: ChatMetaMap): void {
  writeJson(CHATMETA_KEY, map);
}

export function localGetChatMeta(chatId: string): LocalChatMeta | null {
  return allChatMeta()[chatId] ?? null;
}

function touchChat(chatId: string, lastMessage: string, by: string, ts: number): void {
  const map = allChatMeta();
  map[chatId] = { lastMessage, lastMessageBy: by, updatedAt: ts };
  saveChatMeta(map);
}

export function localSendMessage(chatId: string, fromUid: string, text: string, id?: string): string {
  const trimmed = text.trim();
  const rowId = id || crypto.randomUUID();
  if (!trimmed) return rowId;
  const now = Date.now();
  const map = allMessages();
  const list = map[chatId] ? [...map[chatId]] : [];
  list.push({
    id: rowId,
    chatId,
    from: fromUid,
    text: trimmed,
    createdAt: now,
    status: 'sent',
    read: false,
  });
  map[chatId] = list;
  saveMessages(map);
  touchChat(chatId, trimmed, fromUid, now);
  return rowId;
}

export function localFetchMessages(chatId: string, myUid: string, markRead: boolean): LocalMessage[] {
  const map = allMessages();
  const list = map[chatId] ? [...map[chatId]] : [];
  if (markRead) {
    let changed = false;
    for (const m of list) {
      if (m.from !== myUid && !m.read) {
        m.read = true;
        m.status = 'read';
        changed = true;
      }
    }
    if (changed) {
      map[chatId] = list;
      saveMessages(map);
    }
  }
  return list
    .filter((m) => !m.deleted)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-200);
}

export function localEditMessage(chatId: string, messageId: string, newText: string, fromUid?: string): void {
  const trimmed = newText.trim();
  if (!trimmed || !messageId) return;
  const map = allMessages();
  const list = map[chatId];
  if (!list) return;
  const idx = list.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  list[idx] = { ...list[idx], text: trimmed };
  map[chatId] = list;
  saveMessages(map);
  if (fromUid) touchChat(chatId, trimmed, fromUid, Date.now());
}

/** Edit by message id when chat id isn't known — scans all chats. */
export function localEditMessageAnyChat(messageId: string, newText: string): void {
  const trimmed = newText.trim();
  if (!trimmed || !messageId) return;
  const map = allMessages();
  for (const chatId of Object.keys(map)) {
    const list = map[chatId];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], text: trimmed };
      map[chatId] = list;
      saveMessages(map);
      return;
    }
  }
}

export function localDeleteMessage(messageId: string): void {
  const map = allMessages();
  for (const chatId of Object.keys(map)) {
    const list = map[chatId];
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], deleted: true, text: '[removed]' };
      map[chatId] = list;
      saveMessages(map);
      return;
    }
  }
}

export function localDeleteChat(chatId: string): void {
  const map = allMessages();
  if (map[chatId]) {
    delete map[chatId];
    saveMessages(map);
  }
  const meta = allChatMeta();
  if (meta[chatId]) {
    delete meta[chatId];
    saveChatMeta(meta);
  }
}

/* ── profile (device-local only) ────────────────────────────────── */
export type LocalProfile = { name?: string; avatar?: string };
type ProfileMap = Record<string, LocalProfile>; // uid → profile

export function localGetProfile(uid: string): LocalProfile | null {
  const map = readJson<ProfileMap>(PROFILE_KEY, {});
  return map[uid] ?? null;
}

export function localUpdateProfile(uid: string, updates: LocalProfile): void {
  const map = readJson<ProfileMap>(PROFILE_KEY, {});
  map[uid] = { ...(map[uid] || {}), ...updates };
  writeJson(PROFILE_KEY, map);
}
