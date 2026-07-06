import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import {
  addGroupMembers,
  assignMemberTag,
  createGroupTag,
  dbClient,
  deleteGroup,
  deleteGroupMessage,
  fetchGroupMessages,
  formatLastActive,
  getGroupInfo,
  leaveGroup,
  listGroupEligibleContacts,
  listGroupMembers,
  listGroupTags,
  removeGroupMember,
  removeMemberTag,
  sendGroupMessage,
  sendMessage as dbSendMessage,
  setGroupMemberRole,
  updateGroupProfile,
  type GroupContactCandidate,
  type GroupInfo,
  type GroupMember,
  type GroupTag,
} from "../../lib/turso";
import { PremiumMediaViewer, type MediaViewerItem } from "../MediaViewer";
import { deriveUsername, extractGroupMediaItems, normalizeStoredMediaUrl, type GroupMediaItem } from "../../lib/group-media";
import { encodeAudioMessage, encodeImageMessage, encodeVideoMessage } from "../../lib/jscord-upload";

const ICON_PATHS = {
  ArrowLeft: "M15 18l-6-6 6-6",
  Dots: "M5 12h.01M12 12h.01M19 12h.01",
  Pencil: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  Camera: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z",
  Trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
  Check: "M20 6L9 17l-5-5",
  X: "M18 6L6 18M6 6l12 12",
  Users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm6-3.13a4 4 0 010 7.75M23 21v-2a4 4 0 00-3-3.87",
  Share: "M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8m-4-6l-4-4-4 4m4-4v11",
  Link: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  LogOut: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9",
  Chevron: "M9 18l6-6-6-6",
  User: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2m12-10a4 4 0 10-8 0 4 4 0 008 0z",
  Tag: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01",
  Image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  Search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  Bell: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  Plus: "M12 5v14m-7-7h14",
  ClockOff: "M1 1l22 22M12 7v5l3 3M16.24 7.76A6 6 0 1018 12",
  Palette: "M12 2.69l5.66 5.66a8 8 0 11-11.31 0z",
  Volume: "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07",
  Video: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  Story: "M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z",
  PersonPlus: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m8-10a4 4 0 100-8 4 4 0 000 8zm5 3v6m-3-3h6",
  Alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  Ban: "M18 6L6 18M6 6l12 12",
  Message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  Crown: "M3 18h18l-1.5-9-5 3-3.5-6-3.5 6-5-3L3 18z",
  Download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  Forward: "M15 17l5-5-5-5M20 12H9a5 5 0 0 0-5 5v1",
  File: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  Wave: "M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0",
};

const Icon = ({ name, size = 20, color }: { name: keyof typeof ICON_PATHS; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICON_PATHS[name]} />
  </svg>
);

const OBSIDIAN_CARD = {
  background: "linear-gradient(180deg, rgba(22,22,24,0.96) 0%, rgba(12,12,13,0.97) 45%, rgba(6,6,7,0.98) 100%)",
  border: "1px solid rgba(255,255,255,0.045)",
  boxShadow: `
    0 1.5px 0 rgba(255,255,255,0.06) inset,
    0 14px 0 -12px rgba(255,255,255,0.03) inset,
    0 -2px 2px rgba(0,0,0,0.6) inset,
    0 24px 60px rgba(0,0,0,0.65),
    0 10px 28px rgba(0,0,0,0.45)
  `,
};

const CAPSULE_BTN = {
  background: "linear-gradient(180deg, rgba(34,34,37,1) 0%, rgba(16,16,18,1) 50%, rgba(5,5,6,1) 100%)",
  border: "1px solid rgba(255,255,255,0.05)",
  boxShadow: `
    0 2px 0 rgba(255,255,255,0.14) inset,
    0 10px 0 -8px rgba(255,255,255,0.05) inset,
    0 -3px 3px rgba(0,0,0,0.7) inset,
    0 10px 28px rgba(0,0,0,0.6),
    0 3px 8px rgba(0,0,0,0.5)
  `,
};

const ICON_PILL = {
  background: "linear-gradient(180deg, rgba(40,40,44,1) 0%, rgba(20,20,22,1) 55%, rgba(8,8,9,1) 100%)",
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: `
    0 2px 0 rgba(255,255,255,0.18) inset,
    0 8px 0 -7px rgba(255,255,255,0.06) inset,
    0 -2px 3px rgba(0,0,0,0.6) inset,
    0 8px 20px rgba(0,0,0,0.6)
  `,
};

const SILVER_BTN = {
  background: "linear-gradient(180deg, #FFFFFF 0%, #EAEAEA 45%, #B8B8B8 100%)",
  boxShadow: `
    0 1px 0 rgba(255,255,255,0.8) inset,
    0 -2px 4px rgba(0,0,0,0.15) inset,
    0 8px 20px rgba(0,0,0,0.4)
  `,
};

const spring = { type: "spring" as const, stiffness: 320, damping: 30 };
const springSnap = { type: "spring" as const, stiffness: 420, damping: 24 };
const fadeIn = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

function fallbackAvatar(name: string) {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name || "U")}&backgroundColor=f1ede7,ebe4d7&fontWeight=600`;
}

function compressImage(file: File, maxW = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const img = new window.Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxW) { height = (height * maxW) / width; width = maxW; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDateTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ObsidianBackdrop() {
  return (
    <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 80% 50% at 50% 0%, rgba(40,40,48,0.6) 0%, transparent 60%),
          radial-gradient(ellipse 100% 40% at 50% 100%, rgba(20,20,30,0.5) 0%, transparent 70%),
          radial-gradient(circle at 20% 30%, rgba(50,50,60,0.15) 0%, transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(35,35,45,0.2) 0%, transparent 50%),
          linear-gradient(180deg, #0A0A0C 0%, #050507 100%)
        `
      }} />
      <div className="absolute top-0 left-0 right-0 h-[480px]" style={{ background: `radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,255,255,0.025) 0%, transparent 70%)` }} />
      <div className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.025]" style={{ background: "radial-gradient(circle, white 0%, transparent 60%)", filter: "blur(60px)" }} />
      <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-[0.03]" style={{ background: "radial-gradient(circle, white 0%, transparent 60%)", filter: "blur(80px)" }} />
      <div className="absolute inset-0 opacity-[0.025] mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: "180px 180px" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 120% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.5) 100%)" }} />
    </div>
  );
}

export default function GroupDetailsSheet({
  chat,
  onClose,
  allChats = [],
  onGroupDeleted,
}: {
  chat: any;
  onClose: () => void;
  allChats?: any[];
  onGroupDeleted?: () => void;
}) {
  const { user } = useAuth();
  const [info, setInfo] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [tags, setTags] = useState<GroupTag[]>([]);
  const [sharedMedia, setSharedMedia] = useState<GroupMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editDescOpen, setEditDescOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memberSheet, setMemberSheet] = useState<GroupMember | null>(null);
  const [tagEdit, setTagEdit] = useState<GroupMember | null>(null);
  const [iconSheet, setIconSheet] = useState(false);
  const [mediaSheet, setMediaSheet] = useState(false);
  const [memberLabelSheet, setMemberLabelSheet] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState<GroupMember | null>(null);
  const [confirmRole, setConfirmRole] = useState<{ member: GroupMember; nextRole: "admin" | "member" } | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [pickerContacts, setPickerContacts] = useState<GroupContactCandidate[]>([]);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [pickerLoading, setPickerLoading] = useState(false);

  const [viewerItem, setViewerItem] = useState<GroupMediaItem | null>(null);
  const [forwardItem, setForwardItem] = useState<GroupMediaItem | null>(null);
  const [forwardSent, setForwardSent] = useState<string | null>(null);

  const [muted, setMuted] = useState(false);
  const [disappearing, setDisappearing] = useState(false);
  const [groupLinkOn, setGroupLinkOn] = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) return;
    if (!opts?.silent) setLoading(true);
    try {
      const gi = await getGroupInfo(chat.id, user.uid);
      if (!gi) {
        setUnavailable(true);
        setInfo(null);
        setMembers([]);
        setTags([]);
        setSharedMedia([]);
        setLoading(false);
        return;
      }
      const [mems, tgs, msgs] = await Promise.all([
        listGroupMembers(chat.id, user.uid),
        listGroupTags(chat.id, user.uid),
        fetchGroupMessages(chat.id, user.uid, 500),
      ]);
      setUnavailable(false);
      setInfo(gi);
      setMembers(mems);
      setTags(tgs);
      setSharedMedia(extractGroupMediaItems(msgs));
    } catch (e: any) {
      if (/no longer a member/i.test(String(e?.message || ""))) {
        setUnavailable(true);
        setInfo(null);
        setMembers([]);
        setTags([]);
        setSharedMedia([]);
      }
    } finally {
      setLoading(false);
    }
  }, [chat.id, user]);

  useEffect(() => { loadData(); }, [loadData]);

  /* PERF: Adaptive poll interval for Group Info sheet.
     • 4s during active interaction (user can see changes).
     • Backs off to 8s after 30s of idle (group info rarely changes).
     • Pauses entirely when the browser tab is hidden.
     This halves the number of DB round-trips vs. a flat 2.5s interval,
     eliminating the stacked polling when MessagingApp already polls group data. */
  useEffect(() => {
    if (!user) return;
    let interval = 4000;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      interval = 4000;
      idleTimer = setTimeout(() => { interval = 8000; }, 30000);
    };

    const pollIfVisible = () => {
      if (typeof document === 'undefined' || !document.hidden) {
        loadData({ silent: true });
      }
    };

    resetIdle();
    window.addEventListener('pointerdown', resetIdle, { passive: true });
    window.addEventListener('keydown', resetIdle, { passive: true });

    const tick = () => {
      pollIfVisible();
      iv = setTimeout(tick, interval);
    };
    let iv = setTimeout(tick, interval);

    return () => {
      clearTimeout(iv);
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('pointerdown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
    };
  }, [loadData, user]);

  const isAdmin = info?.myRole === "admin" || info?.myRole === "owner";
  const isOwner = info?.myRole === "owner";

  const previewMedia = useMemo(() => sharedMedia.slice(0, 8), [sharedMedia]);

  const filteredPickerContacts = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return pickerContacts;
    return pickerContacts.filter((c) =>
      c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [pickerContacts, pickerQuery]);

  const canDeleteMedia = useCallback((item: GroupMediaItem) => {
    if (!user || !info) return false;
    return item.fromUid === user.uid || info.myRole === "owner" || info.myRole === "admin";
  }, [info, user]);

  const copyInviteLink = async () => {
    if (!info) return;
    const text = `nudgel://group/${info.id}?invite=${info.inviteCode}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Invite link copied");
    } catch {
      showToast("Could not copy invite link", false);
    }
  };

  const handleIconPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !info) return;
    setIconUploading(true);
    try {
      const compressed = await compressImage(file);
      await updateGroupProfile(info.id, user.uid, user.name, { iconUrl: compressed });
      setIconSheet(false);
      showToast("Group photo updated");
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to update photo", false);
    } finally {
      setIconUploading(false);
    }
  };

  const removeIcon = async () => {
    if (!user || !info) return;
    setIconUploading(true);
    try {
      await updateGroupProfile(info.id, user.uid, user.name, { iconUrl: null });
      setIconSheet(false);
      showToast("Photo removed");
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to remove photo", false);
    } finally {
      setIconUploading(false);
    }
  };

  const openPicker = async () => {
    if (!user || !info || !isAdmin) return;
    setPickerLoading(true);
    setPickerOpen(true);
    setPickerSelected(new Set());
    setPickerQuery("");
    try {
      const contacts = await listGroupEligibleContacts(info.id, user.uid);
      setPickerContacts(contacts);
    } catch (err: any) {
      showToast(err?.message || "Failed to load contacts", false);
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAddMembers = async () => {
    if (!user || !info || pickerSelected.size === 0) return;
    setBusy(true);
    try {
      await addGroupMembers(info.id, user.uid, user.name, Array.from(pickerSelected));
      setPickerOpen(false);
      setPickerSelected(new Set());
      showToast(`Added ${pickerSelected.size} member${pickerSelected.size === 1 ? "" : "s"}`);
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to add members", false);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!user || !info || !confirmRemoval) return;
    setBusy(true);
    try {
      await removeGroupMember(info.id, user.uid, user.name, confirmRemoval.userId, confirmRemoval.name);
      showToast(`${confirmRemoval.name} removed`);
      setConfirmRemoval(null);
      setMemberSheet(null);
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to remove member", false);
    } finally {
      setBusy(false);
    }
  };

  const handleRoleChange = async () => {
    if (!user || !info || !confirmRole) return;
    setBusy(true);
    try {
      await setGroupMemberRole(info.id, user.uid, user.name, confirmRole.member.userId, confirmRole.member.name, confirmRole.nextRole);
      showToast(confirmRole.nextRole === "admin" ? `${confirmRole.member.name} is now an admin` : `${confirmRole.member.name} is now a member`);
      setConfirmRole(null);
      setMemberSheet(null);
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to update role", false);
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!user || !info) return;
    setBusy(true);
    try {
      await leaveGroup(info.id, user.uid, user.name);
      showToast("You left the group");
      setConfirmLeave(false);
      onClose();
    } catch (err: any) {
      showToast(err?.message || "Failed to leave group", false);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!user || !info) return;
    setBusy(true);
    try {
      await deleteGroup(info.id, user.uid, user.name);
      showToast("Group deleted");
      setConfirmDelete(false);
      onClose();
      onGroupDeleted?.();
    } catch (err: any) {
      showToast(err?.message || "Failed to delete group", false);
    } finally {
      setBusy(false);
    }
  };

  const downloadMedia = async (item: GroupMediaItem) => {
    try {
      const a = document.createElement("a");
      a.href = normalizeStoredMediaUrl(item.url);
      a.download = item.label || `nudgel-${Date.now()}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      showToast("Download failed", false);
    }
  };

  const forwardMediaTo = async (target: any) => {
    if (!user || !forwardItem) return;
    const url = normalizeStoredMediaUrl(forwardItem.url);
    let encoded = url;
    if (forwardItem.kind === "image" || forwardItem.kind === "gif") encoded = encodeImageMessage(url);
    else if (forwardItem.kind === "video") encoded = encodeVideoMessage(`direct::${url}`);
    else if (forwardItem.kind === "audio" || forwardItem.kind === "voice") encoded = encodeAudioMessage(url);
    try {
      if (target.isGroup) await sendGroupMessage(target.id, user.uid, encoded);
      else await dbSendMessage(target.id, user.uid, encoded);
      setForwardSent(target.name);
      setTimeout(() => { setForwardSent(null); setForwardItem(null); }, 1200);
    } catch (e) {
      showToast("Forward failed", false);
      setForwardItem(null);
    }
  };

  const handleDeleteMedia = async (item: GroupMediaItem) => {
    if (!user || !canDeleteMedia(item)) return;
    if (!confirm(`Delete this media for everyone?`)) return;
    try {
      await deleteGroupMessage(item.messageId, user.uid);
      if (viewerItem?.id === item.id) setViewerItem(null);
      showToast("Media deleted");
      await loadData({ silent: true });
    } catch (err: any) {
      showToast(err?.message || "Failed to delete media", false);
    }
  };

  const viewerMediaItems: MediaViewerItem[] = viewerItem ? [{
    rawUrl: normalizeStoredMediaUrl(viewerItem.url),
    secureUrl: normalizeStoredMediaUrl(viewerItem.url),
    type: viewerItem.kind === "video" ? "video" : viewerItem.kind === "voice" || viewerItem.kind === "audio" ? "voice" : "image",
    sender: viewerItem.fromUid === user?.uid ? "me" : "them",
  }] : [];

  const openViewer = (item: GroupMediaItem) => {
    if (item.kind === "image" || item.kind === "gif" || item.kind === "video") setViewerItem(item);
  };

  return (
    <>
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={spring} className="fixed inset-0 z-50 flex flex-col bg-[#050507] sm:rounded-[44px] overflow-hidden" style={{ contain: 'layout style paint', isolation: 'isolate', willChange: 'transform' }}>
        <ObsidianBackdrop />

        <div className="relative z-30 px-5 pt-5 pb-3">
          <div className="flex items-center justify-between h-11">
            <CapsuleIconBtn onClick={onClose}><Icon name="ArrowLeft" size={18} color="rgba(255,255,255,0.85)" /></CapsuleIconBtn>
            <span className="text-[15px] font-semibold text-white/85 tracking-tight">Group Info</span>
            <div className="relative">
              <CapsuleIconBtn onClick={() => setMenuOpen(!menuOpen)}><Icon name="Dots" size={18} color="rgba(255,255,255,0.85)" /></CapsuleIconBtn>
              <AnimatePresence>
                {menuOpen && (
                  <>
                    <motion.div {...fadeIn} onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40" />
                    <motion.div initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: -6 }}
                      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="absolute top-12 right-0 z-50 w-60 py-2 rounded-[20px] overflow-hidden backdrop-blur-2xl" style={OBSIDIAN_CARD}>
                      <MenuItem icon={<Icon name="Share" size={16} />} label="Share Group" onClick={() => { setMenuOpen(false); copyInviteLink(); }} />
                      <MenuItem icon={<Icon name="Link" size={16} />} label="Copy Invite Link" onClick={() => { setMenuOpen(false); copyInviteLink(); }} />
                      <MenuItem icon={<Icon name="LogOut" size={16} />} label="Leave Group" red onClick={() => { setMenuOpen(false); setConfirmLeave(true); }} />
                      {isOwner && <MenuItem icon={<Icon name="Trash" size={16} />} label="Delete Group" red onClick={() => { setMenuOpen(false); setConfirmDelete(true); }} />}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-area relative z-10" style={{ contain: 'layout style', overscrollBehavior: 'contain' }}>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }} className="w-7 h-7 border-2 border-white/15 border-t-white/70 rounded-full" />
            </div>
          ) : unavailable ? (
            <div className="px-5 pt-20 text-center">
              <div className="mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center" style={ICON_PILL}><Icon name="Users" size={26} color="rgba(255,255,255,0.5)" /></div>
              <h3 className="text-[18px] font-bold text-white/90 mb-2">You are no longer a member of this group.</h3>
              <p className="text-[13px] text-white/40 max-w-[280px] mx-auto leading-relaxed">Ask a group admin to add you back before you can view messages, members, or shared media again.</p>
            </div>
          ) : info ? (
            <div className="pb-12">
              <div className="flex flex-col items-center pt-8 pb-7 px-5">
                <motion.div initial={{ scale: 0.85, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.04 }} className="relative mb-5">
                  <div className="absolute -inset-3 rounded-full opacity-60 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)", filter: "blur(20px)" }} />
                  <motion.button whileTap={{ scale: 0.96 }} whileHover={{ scale: 1.02 }} onClick={() => { if (isAdmin) setIconSheet(true); }} className="relative w-[124px] h-[124px] rounded-full overflow-hidden cursor-pointer group" style={{
                    background: info.iconUrl ? "transparent" : "linear-gradient(180deg, #242428 0%, #0E0E12 55%, #030304 100%)",
                    boxShadow: `0 0 0 1px rgba(255,255,255,0.06),0 0 0 7px rgba(255,255,255,0.015),0 3px 0 rgba(255,255,255,0.16) inset,0 16px 0 -14px rgba(255,255,255,0.06) inset,0 -3px 4px rgba(0,0,0,0.7) inset,0 28px 70px rgba(0,0,0,0.8),0 14px 36px rgba(0,0,0,0.6)`
                  }}>
                    {info.iconUrl ? <img src={info.iconUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Icon name="Users" size={44} color="rgba(255,255,255,0.32)" /></div>}
                    <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 22%, transparent 45%, transparent 80%, rgba(0,0,0,0.35) 100%)" }} />
                    {isAdmin && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center rounded-full"><span className="opacity-0 group-hover:opacity-100 text-white/90 text-[11px] font-medium tracking-wide transition-opacity">Change</span></div>}
                  </motion.button>
                  {iconUploading && <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} className="w-9 h-9 border-[2.5px] border-white/20 border-t-white/80 rounded-full" /></div>}
                </motion.div>

                <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, ...spring }} className="flex items-center gap-2 mb-2">
                  <h2 className="text-[26px] font-bold text-white tracking-tight" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}>{info.name}</h2>
                  {isAdmin && <CapsulePencil onClick={() => setEditNameOpen(true)}><Icon name="Pencil" size={13} color="rgba(255,255,255,0.7)" /></CapsulePencil>}
                </motion.div>

                <motion.button initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.14, ...spring }} onClick={() => { if (isAdmin) setEditDescOpen(true); }} className="text-[13px] text-white/40 text-center max-w-[280px] hover:text-white/60 transition-colors truncate">
                  {info.description || (isAdmin ? "Add group description..." : "No description")}
                </motion.button>
              </div>

              <motion.div initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18, ...spring }} className="grid grid-cols-4 gap-2.5 px-5 mb-6">
                <ActionCapsule icon={<Icon name="Story" size={20} />} label="Story" onClick={() => showToast("Story coming soon")} />
                <ActionCapsule icon={<Icon name="Video" size={20} />} label="Video" onClick={() => showToast("Video call coming soon")} />
                <ActionCapsule icon={<Icon name="Bell" size={20} />} label={muted ? "Unmute" : "Mute"} active={muted} onClick={() => { setMuted(!muted); showToast(muted ? "Unmuted" : "Muted"); }} />
                <ActionCapsule icon={<Icon name="Search" size={20} />} label="Search" onClick={() => showToast("Search coming soon")} />
              </motion.div>

              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.22, ...spring }} className="relative mx-5 mb-5 rounded-[24px] overflow-hidden" style={OBSIDIAN_CARD}>
                <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, transparent 100%)" }} />
                <RowCapsule icon={<Icon name="ClockOff" size={18} />} label="Disappearing messages" value={disappearing ? "On" : "Off"} onClick={() => { setDisappearing(!disappearing); showToast(disappearing ? "Disappearing off" : "Disappearing on"); }} />
                <Divider />
                <RowCapsule icon={<Icon name="Palette" size={18} />} label="Chat color & wallpaper" onClick={() => showToast("Customization coming soon")} />
                <Divider />
                <RowCapsule icon={<Icon name="Volume" size={18} />} label="Sounds & notifications" onClick={() => showToast("Notifications coming soon")} />
              </motion.div>

              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.26, ...spring }} className="mb-5">
                <div className="flex items-center justify-between px-6 mb-3">
                  <span className="text-[14px] font-bold text-white/85 tracking-tight">Shared Media</span>
                  <button onClick={() => setMediaSheet(true)} className="text-[12px] font-medium text-white/45 hover:text-white/80 transition-colors">See all</button>
                </div>
                {previewMedia.length > 0 ? (
                  <div className="flex gap-2.5 overflow-x-auto px-5 pb-3 no-scrollbar">
                    {previewMedia.map((item) => <MediaPreviewTile key={item.id} item={item} onOpen={openViewer} />)}
                  </div>
                ) : (
                  <div className="px-5">
                    <div className="rounded-[22px] px-5 py-6 text-center" style={OBSIDIAN_CARD}>
                      <p className="text-[13px] font-semibold text-white/70">No shared media yet</p>
                      <p className="text-[11px] text-white/30 mt-1">Photos, videos, GIFs, audio and files sent in this group will appear here.</p>
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, ...spring }} className="relative mx-5 mb-5 rounded-[24px] overflow-hidden" style={OBSIDIAN_CARD}>
                <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, transparent 100%)" }} />
                <div className="relative px-5 py-3.5 flex items-center justify-between">
                  <span className="text-[14px] font-bold text-white/85">{members.length} {members.length === 1 ? "Member" : "Members"}</span>
                </div>
                <Divider />
                {isAdmin && <><AddMemberRow onClick={openPicker} /><Divider /></>}
                {members.map((m, i) => (
                  <div key={m.userId}>
                    <MemberRow member={m} isYou={m.userId === user?.uid} onClick={() => setMemberSheet(m)} />
                    {i < members.length - 1 && <Divider />}
                  </div>
                ))}
              </motion.div>

              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.34, ...spring }} className="relative mx-5 mb-5 rounded-[24px] overflow-hidden" style={OBSIDIAN_CARD}>
                <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.045) 0%, transparent 100%)" }} />
                <RowCapsule icon={<Icon name="Link" size={18} />} label="Group link" value={groupLinkOn ? "On" : "Off"} onClick={() => { setGroupLinkOn(!groupLinkOn); if (!groupLinkOn) copyInviteLink(); else showToast("Invite link off"); }} />
                {isAdmin && <Divider />}
                {isAdmin && <RowCapsule icon={<Icon name="Tag" size={18} />} label="Member Label" onClick={() => setMemberLabelSheet(true)} />}
              </motion.div>

              <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.38, ...spring }} className="relative mx-5 mb-6 rounded-[24px] overflow-hidden" style={OBSIDIAN_CARD}>
                <div className="absolute top-0 inset-x-0 h-20 pointer-events-none z-0" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)" }} />
                <DangerRow icon={<Icon name="LogOut" size={18} />} label="Leave group" onClick={() => setConfirmLeave(true)} />
                {isOwner && <><Divider /><DangerRow icon={<Icon name="Trash" size={18} />} label="Delete group" onClick={() => setConfirmDelete(true)} /></>}
              </motion.div>

              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="text-center text-[11px] text-white/20 font-medium tracking-wide">Unlimited Messaging · Encrypted</motion.p>
            </div>
          ) : null}
        </div>
      </motion.div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -60, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full flex items-center gap-3 backdrop-blur-2xl" style={CAPSULE_BTN}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.08, ...springSnap }} className={`w-5 h-5 rounded-full flex items-center justify-center ${toast.ok ? "bg-emerald-500/20" : "bg-red-500/20"}`}>
              {toast.ok ? <Icon name="Check" size={12} color="#34D399" /> : <Icon name="X" size={12} color="#F87171" />}
            </motion.div>
            <span className="text-[13px] font-medium text-white/85">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {iconSheet && (
          <BottomSheet onClose={() => setIconSheet(false)}>
            <h3 className="text-[17px] font-bold text-white/90 text-center mb-6">Change Group Photo</h3>
            <div className="space-y-2">
              <SheetBtn icon={<Icon name="Camera" size={18} />} label="Choose from Gallery" onClick={() => document.getElementById("gip")?.click()} />
              {info?.iconUrl && <SheetBtn icon={<Icon name="Trash" size={18} />} label="Remove Current Photo" red onClick={removeIcon} />}
            </div>
            <button onClick={() => setIconSheet(false)} className="w-full h-12 mt-4 rounded-full text-white/70 font-semibold text-[14px] transition-colors" style={CAPSULE_BTN}>Cancel</button>
            <input id="gip" type="file" accept="image/*" hidden onChange={handleIconPick} />
          </BottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editNameOpen && info && (
          <EditModal title="Edit Group Name" value={info.name} maxLen={50}
            onSave={async (v) => { if (!user || !v.trim()) return; await updateGroupProfile(info.id, user.uid, user.name, { name: v.trim() }); setEditNameOpen(false); showToast("Name updated"); loadData({ silent: true }); }}
            onClose={() => setEditNameOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editDescOpen && info && (
          <EditDescModal value={info.description} maxLen={500}
            onSave={async (v) => { if (!user) return; await updateGroupProfile(info.id, user.uid, user.name, { description: v.trim() }); setEditDescOpen(false); showToast("Description updated"); loadData({ silent: true }); }}
            onClose={() => setEditDescOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memberSheet && info && (
          <MemberSheet
            member={memberSheet}
            isAdmin={!!isAdmin}
            canRemove={!!isAdmin && memberSheet.userId !== user?.uid && memberSheet.role !== "owner"}
            canPromote={!!isAdmin && memberSheet.role === "member" && memberSheet.userId !== user?.uid}
            canDemote={!!isAdmin && memberSheet.role === "admin" && memberSheet.userId !== user?.uid}
            onClose={() => setMemberSheet(null)}
            onViewProfile={() => { setMemberSheet(null); showToast("Profile coming soon"); }}
            onAddTag={() => { const m = memberSheet; setMemberSheet(null); setTimeout(() => setTagEdit(m), 300); }}
            onMessage={() => { setMemberSheet(null); showToast("DM coming soon"); }}
            onRemove={() => setConfirmRemoval(memberSheet)}
            onPromote={() => setConfirmRole({ member: memberSheet, nextRole: "admin" })}
            onDemote={() => setConfirmRole({ member: memberSheet, nextRole: "member" })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tagEdit && info && (
          <TagEditSheet member={tagEdit} groupInfo={info} allTags={tags} onClose={() => setTagEdit(null)} onSaved={() => { setTagEdit(null); showToast("Label updated"); loadData({ silent: true }); }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mediaSheet && (
          <FullBottomSheet title="Shared Media" onClose={() => setMediaSheet(false)}>
            <SharedMediaSheetContent
              items={sharedMedia}
              userId={user?.uid || ""}
              allChats={allChats}
              onOpen={openViewer}
              onForward={(item) => setForwardItem(item)}
              onDownload={downloadMedia}
              onDelete={handleDeleteMedia}
              canDelete={canDeleteMedia}
            />
          </FullBottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memberLabelSheet && (
          <FullBottomSheet title="Member Labels" onClose={() => setMemberLabelSheet(false)}>
            <p className="text-[12px] text-white/35 px-5 pb-3">Tap a member to assign or edit their label (max 15 characters).</p>
            <div className="px-3 space-y-2 pb-4">
              {members.map((m) => (
                <RippleBtn key={m.userId} onClick={() => setTagEdit(m)} className="w-full px-4 py-3 flex items-center gap-3 rounded-2xl" style={CAPSULE_BTN}>
                  <img src={m.avatar} className="w-9 h-9 rounded-full object-cover" alt="" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-[13.5px] font-semibold text-white/85 truncate block">{m.name}</span>
                    {m.tags.length > 0 && <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border mt-0.5" style={{ background: m.tags[0].color + "18", color: m.tags[0].color, borderColor: m.tags[0].color + "40" }}>{m.tags[0].name}</span>}
                  </div>
                  <Icon name="Pencil" size={13} color="rgba(255,255,255,0.3)" />
                </RippleBtn>
              ))}
            </div>
          </FullBottomSheet>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerOpen && (
          <FullScreenMemberPicker
            loading={pickerLoading}
            contacts={filteredPickerContacts}
            query={pickerQuery}
            selected={pickerSelected}
            busy={busy}
            onClose={() => setPickerOpen(false)}
            onQueryChange={setPickerQuery}
            onToggle={(uid) => setPickerSelected((prev) => {
              const next = new Set(prev);
              if (next.has(uid)) next.delete(uid); else next.add(uid);
              return next;
            })}
            onConfirm={handleAddMembers}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmLeave && (
          <ConfirmSheet title="Leave this group?" description="You will stop receiving messages and lose access until an admin adds you back." confirmLabel="Leave" destructive busy={busy} onClose={() => setConfirmLeave(false)} onConfirm={handleLeave} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmSheet title="Delete this group?" description="This removes the group conversation, members, and shared media for everyone." confirmLabel="Delete Group" destructive busy={busy} onClose={() => setConfirmDelete(false)} onConfirm={handleDeleteGroup} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmRemoval && (
          <ConfirmSheet title={`Remove ${confirmRemoval.name}?`} description="They will immediately lose access to the group and its messages." confirmLabel="Remove Member" destructive busy={busy} onClose={() => setConfirmRemoval(null)} onConfirm={handleRemoveMember} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmRole && (
          <ConfirmSheet title={confirmRole.nextRole === "admin" ? `Make ${confirmRole.member.name} an admin?` : `Remove admin from ${confirmRole.member.name}?`} description={confirmRole.nextRole === "admin" ? "They will be able to add and remove members, edit the group, and manage settings." : "They will return to regular member permissions immediately."} confirmLabel={confirmRole.nextRole === "admin" ? "Make Admin" : "Remove Admin"} busy={busy} onClose={() => setConfirmRole(null)} onConfirm={handleRoleChange} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewerItem && (
          <>
            <PremiumMediaViewer items={viewerMediaItems} initialIndex={0} onClose={() => setViewerItem(null)} onForward={() => setForwardItem(viewerItem)} />
            {canDeleteMedia(viewerItem) && (
              <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} onClick={() => handleDeleteMedia(viewerItem)} className="fixed left-4 top-4 z-[115] h-10 px-4 rounded-full flex items-center gap-2 backdrop-blur-xl border text-red-300" style={{ background: "rgba(45,10,10,0.72)", borderColor: "rgba(248,113,113,0.25)" }}>
                <Icon name="Trash" size={15} color="#FCA5A5" />
                <span className="text-[12px] font-semibold">Delete</span>
              </motion.button>
            )}
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {forwardItem && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setForwardItem(null)} className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-lg" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 350, damping: 34 }} className="fixed inset-x-0 bottom-0 z-[130] mx-auto max-w-md rounded-t-[28px] overflow-hidden" style={{ background: 'linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)', border: '1px solid rgba(255,255,255,0.06)', borderBottom: 'none', boxShadow: '0 -24px 80px rgba(0,0,0,0.7)' }}>
              <div className="flex flex-col max-h-[70vh]">
                <div className="flex-shrink-0 px-5 pt-3 pb-3">
                  <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-4" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-[16px] font-bold text-white/90">Forward to...</h3>
                    <button onClick={() => setForwardItem(null)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60 hover:bg-white/[0.1] transition-colors"><Icon name="X" size={14} color="rgba(255,255,255,0.7)" /></button>
                  </div>
                </div>
                {forwardSent ? (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-3 py-12">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }} className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center"><Icon name="Check" size={26} color="#34D399" /></motion.div>
                    <span className="text-[14px] font-semibold text-white/85">Sent to {forwardSent}</span>
                  </motion.div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-3 pb-6 space-y-1">
                    {allChats.filter((c: any) => c.id !== chat.id).length === 0 && <div className="text-center py-10 text-[13px] text-white/35">No other chats to forward to</div>}
                    {allChats.filter((c: any) => c.id !== chat.id).map((c: any) => (
                      <motion.button key={c.id} whileTap={{ scale: 0.98 }} onClick={() => forwardMediaTo(c)} className="w-full px-3 py-2.5 flex items-center gap-3 rounded-2xl hover:bg-white/[0.04] transition-colors text-left">
                        <img src={c.img} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-[14px] font-semibold text-white/85 truncate block">{c.name}</span>
                          <span className="text-[11.5px] text-white/30 truncate block">{c.isGroup ? 'Group' : (c.online ? 'Online' : 'Offline')}</span>
                        </div>
                        <Icon name="Forward" size={16} color="rgba(255,255,255,0.3)" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SharedMediaSheetContent({
  items,
  userId,
  allChats,
  onOpen,
  onForward,
  onDownload,
  onDelete,
  canDelete,
}: {
  items: GroupMediaItem[];
  userId: string;
  allChats: any[];
  onOpen: (item: GroupMediaItem) => void;
  onForward: (item: GroupMediaItem) => void;
  onDownload: (item: GroupMediaItem) => void;
  onDelete: (item: GroupMediaItem) => void;
  canDelete: (item: GroupMediaItem) => boolean;
}) {
  const [filter, setFilter] = useState<"all" | "image" | "video" | "audio" | "document">("all");
  const filtered = useMemo(() => items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "audio") return item.kind === "audio" || item.kind === "voice";
    return item.kind === filter || (filter === "image" && item.kind === "gif");
  }), [filter, items]);

  return (
    <div className="pb-5">
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {[
          ["all", "All"],
          ["image", "Photos"],
          ["video", "Videos"],
          ["audio", "Audio"],
          ["document", "Files"],
        ].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value as any)} className={`px-4 h-9 rounded-full text-[12px] font-semibold whitespace-nowrap ${filter === value ? "text-black" : "text-white/60"}`} style={filter === value ? SILVER_BTN : CAPSULE_BTN}>{label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-10 text-center text-white/35 text-[13px]">No media in this section yet</div>
      ) : (
        <div className="px-3 space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="rounded-[22px] overflow-hidden" style={OBSIDIAN_CARD}>
              <div className="p-3">
                <div className="flex items-center gap-3 mb-3">
                  <img src={item.fromAvatar || fallbackAvatar(item.fromName)} alt="" className="w-9 h-9 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-white/85 truncate">{item.fromName}</div>
                    <div className="text-[11px] text-white/30">{fmtDateTime(item.createdAt)}</div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{item.kind}</span>
                </div>

                {item.kind === "image" || item.kind === "gif" ? (
                  <button onClick={() => onOpen(item)} className="block w-full rounded-[18px] overflow-hidden border border-white/[0.05]">
                    <img src={normalizeStoredMediaUrl(item.url)} className="w-full h-auto max-h-[260px] object-cover" alt="" />
                  </button>
                ) : item.kind === "video" ? (
                  <button onClick={() => onOpen(item)} className="relative block w-full rounded-[18px] overflow-hidden border border-white/[0.05] bg-black">
                    <video src={normalizeStoredMediaUrl(item.url)} muted playsInline preload="metadata" className="w-full h-auto max-h-[260px] object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center"><Icon name="Video" size={18} color="white" /></div></div>
                  </button>
                ) : item.kind === "audio" || item.kind === "voice" ? (
                  <div className="rounded-[18px] p-4 border border-white/[0.05] bg-white/[0.02]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center" style={ICON_PILL}><Icon name="Wave" size={18} color="rgba(255,255,255,0.75)" /></div>
                      <div>
                        <div className="text-[13px] font-semibold text-white/85">{item.kind === "voice" ? "Voice Note" : "Audio"}</div>
                        <div className="text-[11px] text-white/30 truncate max-w-[210px]">{item.label}</div>
                      </div>
                    </div>
                    <audio controls className="w-full" src={normalizeStoredMediaUrl(item.url)} />
                  </div>
                ) : (
                  <div className="rounded-[18px] p-4 border border-white/[0.05] bg-white/[0.02] flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center" style={ICON_PILL}><Icon name="File" size={18} color="rgba(255,255,255,0.75)" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-white/85 truncate">{item.label}</div>
                      <div className="text-[11px] text-white/30">Document</div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  <ActionMiniBtn icon={<Icon name="Forward" size={14} color="rgba(255,255,255,0.75)" />} label="Forward" onClick={() => onForward(item)} />
                  <ActionMiniBtn icon={<Icon name="Download" size={14} color="rgba(255,255,255,0.75)" />} label="Download" onClick={() => onDownload(item)} />
                  {canDelete(item) && <ActionMiniBtn icon={<Icon name="Trash" size={14} color="#FCA5A5" />} label="Delete" danger onClick={() => onDelete(item)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullScreenMemberPicker({
  loading,
  contacts,
  query,
  selected,
  busy,
  onClose,
  onQueryChange,
  onToggle,
  onConfirm,
}: {
  loading: boolean;
  contacts: GroupContactCandidate[];
  query: string;
  selected: Set<string>;
  busy: boolean;
  onClose: () => void;
  onQueryChange: (q: string) => void;
  onToggle: (uid: string) => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={spring} className="fixed inset-0 z-[90] bg-[#050507] flex flex-col">
      <ObsidianBackdrop />
      <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-3">
        <CapsuleIconBtn onClick={onClose}><Icon name="X" size={16} color="rgba(255,255,255,0.8)" /></CapsuleIconBtn>
        <div className="text-center">
          <div className="text-[15px] font-semibold text-white/85">Add Members</div>
          <div className="text-[11px] text-white/35">Selected ({selected.size})</div>
        </div>
        <button disabled={selected.size === 0 || busy} onClick={onConfirm} className={`h-10 px-5 rounded-full text-[13px] font-bold text-black ${selected.size === 0 || busy ? "opacity-40" : ""}`} style={SILVER_BTN}>{busy ? "Adding..." : "Add"}</button>
      </div>

      <div className="relative z-10 px-5 pb-3">
        <div className="flex items-center gap-3 rounded-2xl px-4 h-[46px]" style={{ background: "rgba(255,244,210,0.04)", border: "1px solid rgba(255,244,210,0.08)" }}>
          <Icon name="Search" size={16} color="#8A7D67" />
          <input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="Search contacts" className="flex-1 bg-transparent text-[13px] text-[#F3EADB] placeholder-[#6E6353] outline-none" />
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-40"><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }} className="w-7 h-7 border-2 border-white/15 border-t-white/70 rounded-full" /></div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={ICON_PILL}><Icon name="Users" size={22} color="rgba(255,255,255,0.45)" /></div>
            <div className="text-[14px] font-semibold text-white/75">No eligible contacts</div>
            <div className="text-[12px] text-white/30 mt-1">Only real contacts from your existing Nudgel conversations appear here.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((c) => {
              const checked = selected.has(c.uid);
              return (
                <button key={c.uid} onClick={() => onToggle(c.uid)} className="w-full flex items-center gap-3 px-3 py-3 rounded-[22px] text-left transition-colors" style={{ ...OBSIDIAN_CARD, background: checked ? "linear-gradient(180deg, rgba(40,40,46,0.98) 0%, rgba(16,16,18,0.98) 100%)" : OBSIDIAN_CARD.background }}>
                  <div className="relative">
                    <img src={c.avatar || fallbackAvatar(c.name)} className="w-12 h-12 rounded-full object-cover" alt="" />
                    <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-[2px] border-[#111114] ${c.online ? "bg-emerald-400" : "bg-white/20"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-white/90 truncate">{c.name}</div>
                    <div className="text-[11px] text-white/40 truncate">{c.username}</div>
                    <div className="text-[10.5px] text-white/28 truncate">{c.online ? "Online" : formatLastActive(c.lastActive)}</div>
                  </div>
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center ${checked ? "border-[#D8AD5A] bg-[#D8AD5A]" : "border-white/15 bg-white/[0.02]"}`}>
                    {checked && <Icon name="Check" size={12} color="#1A1206" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MediaPreviewTile({ item, onOpen }: { item: GroupMediaItem; onOpen: (item: GroupMediaItem) => void }) {
  if (item.kind === "image" || item.kind === "gif") {
    return (
      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ y: -2 }} onClick={() => onOpen(item)} className="flex-shrink-0 w-[108px] h-[108px] rounded-[20px] overflow-hidden relative" style={{ boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset,0 8px 20px rgba(0,0,0,0.5)`, border: "1px solid rgba(255,255,255,0.05)" }}>
        <img src={normalizeStoredMediaUrl(item.url)} className="w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 pointer-events-none rounded-[20px]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.1) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.3) 100%)" }} />
      </motion.button>
    );
  }
  if (item.kind === "video") {
    return (
      <motion.button whileTap={{ scale: 0.95 }} whileHover={{ y: -2 }} onClick={() => onOpen(item)} className="flex-shrink-0 w-[108px] h-[108px] rounded-[20px] overflow-hidden relative bg-black" style={{ boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset,0 8px 20px rgba(0,0,0,0.5)`, border: "1px solid rgba(255,255,255,0.05)" }}>
        <video src={normalizeStoredMediaUrl(item.url)} muted playsInline preload="metadata" className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center"><div className="w-10 h-10 rounded-full bg-black/55 flex items-center justify-center"><Icon name="Video" size={16} color="white" /></div></div>
      </motion.button>
    );
  }
  return (
    <div className="flex-shrink-0 w-[108px] h-[108px] rounded-[20px] flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ ...ICON_PILL, boxShadow: `0 1px 0 rgba(255,255,255,0.06) inset,0 8px 20px rgba(0,0,0,0.5)` }}>
      <Icon name={item.kind === "document" ? "File" : "Wave"} size={18} color="rgba(255,255,255,0.7)" />
      <span className="text-[11px] text-white/60 font-medium leading-tight">{item.kind === "document" ? "Document" : item.kind === "voice" ? "Voice Note" : "Audio"}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)" }} />;
}

function RippleBtn({ children, onClick, className = "", style }: { children: React.ReactNode; onClick?: () => void; className?: string; style?: React.CSSProperties }) {
  const [r, setR] = useState<{ x: number; y: number; id: number }[]>([]);
  const click = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setR((p) => [...p, { x: e.clientX - rect.left, y: e.clientY - rect.top, id }]);
    setTimeout(() => setR((p) => p.filter((ri) => ri.id !== id)), 600);
    onClick?.();
  };
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={click} className={`relative overflow-hidden ${className}`} style={style}>
      {r.map((ri) => <motion.span key={ri.id} initial={{ scale: 0, opacity: 0.35 }} animate={{ scale: 4, opacity: 0 }} transition={{ duration: 0.6 }} className="absolute rounded-full bg-white/15 pointer-events-none" style={{ left: ri.x - 40, top: ri.y - 40, width: 80, height: 80 }} />)}
      {children}
    </motion.button>
  );
}

function CapsuleIconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <motion.button whileTap={{ scale: 0.93 }} whileHover={{ y: -1 }} onClick={onClick} className="relative w-10 h-10 rounded-full flex items-center justify-center transition-shadow overflow-hidden" style={CAPSULE_BTN}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)" }} /><span className="relative">{children}</span></motion.button>;
}

function CapsulePencil({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <motion.button whileTap={{ scale: 0.92 }} whileHover={{ y: -1 }} onClick={onClick} className="relative w-7 h-7 rounded-full flex items-center justify-center overflow-hidden" style={CAPSULE_BTN}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)" }} /><span className="relative">{children}</span></motion.button>;
}

function ActionCapsule({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return <motion.button whileTap={{ scale: 0.95 }} whileHover={{ y: -2 }} onClick={onClick} className="relative flex flex-col items-center gap-2 py-3.5 rounded-[22px] transition-all overflow-hidden" style={{ ...CAPSULE_BTN, background: active ? "linear-gradient(180deg, rgba(52,52,58,1) 0%, rgba(24,24,28,1) 55%, rgba(8,8,10,1) 100%)" : CAPSULE_BTN.background }}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-[22px]" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)" }} /><div className="relative w-10 h-10 rounded-full flex items-center justify-center" style={ICON_PILL}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)" }} /><span className={`relative ${active ? "text-white" : "text-white/75"}`}>{icon}</span></div><span className="relative text-[11px] font-semibold text-white/65 tracking-tight">{label}</span></motion.button>;
}

function RowCapsule({ icon, label, value, onClick }: { icon: React.ReactNode; label: string; value?: string; onClick: () => void }) {
  return <RippleBtn onClick={onClick} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"><div className="relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden" style={ICON_PILL}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)" }} /><span className="relative text-white/65">{icon}</span></div><span className="flex-1 text-[14px] font-medium text-white/85">{label}</span>{value && <span className="text-[12.5px] text-white/40 mr-1">{value}</span>}<Icon name="Chevron" size={14} color="rgba(255,255,255,0.25)" /></RippleBtn>;
}

function MenuItem({ icon, label, red, onClick }: { icon: React.ReactNode; label: string; red?: boolean; onClick: () => void }) {
  return <RippleBtn onClick={onClick} className={`w-full px-4 py-3 flex items-center gap-3 text-left ${red ? "text-red-400/90 hover:bg-red-500/8" : "text-white/85 hover:bg-white/[0.04]"}`}><span className="w-5 flex justify-center opacity-65">{icon}</span><span className="text-[13.5px] font-medium">{label}</span></RippleBtn>;
}

function DangerRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <RippleBtn onClick={onClick} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-red-500/[0.04] transition-colors text-left"><div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(165deg, rgba(80,30,30,0.7) 0%, rgba(40,15,15,0.7) 60%, rgba(20,8,8,0.7) 100%)", border: "1px solid rgba(255,80,80,0.15)", boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 16px rgba(0,0,0,0.4)" }}><span className="text-red-400/85">{icon}</span></div><span className="flex-1 text-[14px] font-medium text-red-400/90">{label}</span><Icon name="Chevron" size={14} color="rgba(239,68,68,0.35)" /></RippleBtn>;
}

function AddMemberRow({ onClick }: { onClick: () => void }) {
  return <RippleBtn onClick={onClick} className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"><div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(165deg, rgba(48,48,52,1) 0%, rgba(28,28,32,1) 60%, rgba(16,16,18,1) 100%)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 6px 16px rgba(0,0,0,0.5)" }}><Icon name="Plus" size={16} color="rgba(255,255,255,0.8)" /></div><span className="flex-1 text-[14px] font-medium text-white/85">Add members</span><Icon name="Chevron" size={14} color="rgba(255,255,255,0.25)" /></RippleBtn>;
}

function MemberRow({ member, isYou, onClick }: { member: GroupMember; isYou: boolean; onClick: () => void }) {
  return <RippleBtn onClick={onClick} className="w-full px-5 py-3.5 flex items-center gap-3.5 hover:bg-white/[0.02] transition-colors text-left"><div className="relative flex-shrink-0"><div className="w-11 h-11 rounded-full p-[1.5px]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.15), rgba(255,255,255,0.02))" }}><img src={member.avatar} className="w-full h-full rounded-full object-cover" alt="" /></div>{member.online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-[2.5px] border-[#161618]" />}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><span className="text-[14px] font-semibold text-white/90 truncate">{member.name}{isYou && <span className="text-white/30 font-normal text-[12px] ml-1">(You)</span>}</span></div>{member.tags.length > 0 ? <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border" style={{ background: member.tags[0].color + "18", color: member.tags[0].color, borderColor: member.tags[0].color + "40" }}>{member.tags[0].name}</span> : <span className="text-[11.5px] text-white/30">{deriveUsername(member.email)}</span>}</div>{member.role === "owner" && <span className="text-[10px] font-bold text-white/55 uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>Owner</span>}{member.role === "admin" && <span className="text-[10px] font-bold text-white/55 uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>Admin</span>}<Icon name="Chevron" size={14} color="rgba(255,255,255,0.25)" /></RippleBtn>;
}

function SheetBtn({ icon, label, red, onClick }: { icon: React.ReactNode; label: string; red?: boolean; onClick?: () => void }) {
  return <RippleBtn onClick={onClick} className={`relative w-full px-4 py-3 flex items-center gap-4 rounded-full transition-colors text-left overflow-hidden ${red ? "text-red-400/85" : "text-white/85"}`} style={CAPSULE_BTN}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%)" }} /><div className="relative w-9 h-9 rounded-full flex items-center justify-center overflow-hidden" style={ICON_PILL}><div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)" }} /><span className={`relative ${red ? "text-red-400/85" : "text-white/65"}`}>{icon}</span></div><span className="relative text-[14px] font-medium">{label}</span></RippleBtn>;
}

function ActionMiniBtn({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex-1 h-10 rounded-full px-3 flex items-center justify-center gap-2 text-[12px] font-semibold ${danger ? "text-red-300" : "text-white/75"}`} style={danger ? { ...CAPSULE_BTN, background: "linear-gradient(180deg, rgba(55,20,20,1) 0%, rgba(24,10,10,1) 100%)" } : CAPSULE_BTN}>{icon}{label}</button>;
}

function BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return <><motion.div {...fadeIn} onClick={onClose} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl" /><motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 350, damping: 34 }} className="fixed inset-x-0 bottom-0 z-[80] mx-auto max-w-md rounded-t-[32px] overflow-hidden backdrop-blur-2xl" style={{ background: "linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none", boxShadow: "0 -24px 80px rgba(0,0,0,0.7)" }}><div className="px-6 pt-3 pb-6"><div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-5" />{children}</div></motion.div></>;
}

function FullBottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <><motion.div {...fadeIn} onClick={onClose} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl" /><motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 350, damping: 34 }} className="fixed inset-x-0 bottom-0 z-[80] mx-auto max-w-md rounded-t-[32px] overflow-hidden" style={{ background: "linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none", boxShadow: "0 -24px 80px rgba(0,0,0,0.7)" }}><div className="flex flex-col h-[72vh]"><div className="flex-shrink-0 pt-3 px-5 pb-2 relative"><div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" /><div className="flex items-center justify-between"><h3 className="text-[17px] font-bold text-white/90">{title}</h3><CapsuleIconBtn onClick={onClose}><Icon name="X" size={14} color="rgba(255,255,255,0.7)" /></CapsuleIconBtn></div></div><div className="flex-1 overflow-y-auto">{children}</div></div></motion.div></>;
}

function MemberSheet({ member, isAdmin, canRemove, canPromote, canDemote, onClose, onViewProfile, onAddTag, onMessage, onRemove, onPromote, onDemote }: {
  member: GroupMember; isAdmin: boolean; canRemove: boolean; canPromote: boolean; canDemote: boolean;
  onClose: () => void; onViewProfile: () => void; onAddTag: () => void; onMessage: () => void; onRemove: () => void; onPromote: () => void; onDemote: () => void;
}) {
  return <BottomSheet onClose={onClose}><div className="flex flex-col items-center pt-1"><motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, delay: 0.08 }} className="relative mb-4"><div className="absolute -inset-2 rounded-full opacity-50" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08), transparent 70%)", filter: "blur(16px)" }} /><div className="relative w-[88px] h-[88px] rounded-full p-[2px]" style={{ background: "linear-gradient(165deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03))" }}><img src={member.avatar} className="w-full h-full rounded-full object-cover" alt="" /></div>{member.online && <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 border-[3px] border-[#1A1A1E]" />}</motion.div><motion.h3 initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.12 }} className="text-[19px] font-bold text-white/95 mb-1">{member.name}</motion.h3><motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.16 }} className="flex items-center gap-2 mb-1">{member.role === "owner" && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white/70 uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.06)" }}>Owner</span>}{member.role === "admin" && <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white/70 uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.06)" }}>Admin</span>}{member.tags.length > 0 && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border" style={{ background: member.tags[0].color + "18", color: member.tags[0].color, borderColor: member.tags[0].color + "40" }}>{member.tags[0].name}</span>}</motion.div><motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="w-full space-y-2.5 mt-5"><SheetBtn icon={<Icon name="Message" size={17} />} label="Message" onClick={onMessage} /><SheetBtn icon={<Icon name="User" size={17} />} label="View Profile" onClick={onViewProfile} />{isAdmin && <SheetBtn icon={<Icon name="Tag" size={17} />} label={member.tags.length > 0 ? "Edit Label" : "Add Label"} onClick={onAddTag} />}{canPromote && <SheetBtn icon={<Icon name="Crown" size={17} />} label="Make Admin" onClick={onPromote} />}{canDemote && <SheetBtn icon={<Icon name="Crown" size={17} />} label="Remove Admin" onClick={onDemote} />}{canRemove && <SheetBtn icon={<Icon name="Trash" size={17} />} label="Remove Member" red onClick={onRemove} />}</motion.div><button onClick={onClose} className="w-full h-11 mt-3 rounded-full text-[13px] font-medium text-white/40 hover:text-white/70 transition-colors">Close</button></div></BottomSheet>;
}

function TagEditSheet({ member, groupInfo, allTags, onClose, onSaved }: { member: GroupMember; groupInfo: GroupInfo; allTags: GroupTag[]; onClose: () => void; onSaved: () => void; }) {
  const { user } = useAuth();
  const [val, setVal] = useState(member.tags.length > 0 ? member.tags[0].name : "");
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveTag = async () => {
    if (!user || !val.trim() || val.trim().length > 15) return;
    setLoading(true);
    try {
      if (member.tags.length > 0) await removeMemberTag(groupInfo.id, user.uid, user.name, member.userId, member.name, member.tags[0].id);
      const tagName = val.trim();
      const existing = allTags.find((t) => t.name === tagName);
      if (existing) {
        await assignMemberTag(groupInfo.id, user.uid, user.name, member.userId, member.name, existing.id, existing.name);
      } else {
        const colors = ["#F87171", "#FBBF24", "#34D399", "#60A5FA", "#A78BFA", "#C084FC", "#F472B6"];
        const id = await createGroupTag(groupInfo.id, user.uid, user.name, tagName, colors[Math.floor(Math.random() * colors.length)]);
        await assignMemberTag(groupInfo.id, user.uid, user.name, member.userId, member.name, id, tagName);
      }
      onSaved();
    } finally { setLoading(false); }
  };

  const removeTag = async () => {
    if (!user || member.tags.length === 0) return;
    setLoading(true);
    try {
      await removeMemberTag(groupInfo.id, user.uid, user.name, member.userId, member.name, member.tags[0].id);
      onSaved();
    } finally { setLoading(false); }
  };

  return <BottomSheet onClose={onClose}><h3 className="text-[17px] font-bold text-white/90 text-center mb-1">Member Label</h3><p className="text-[12px] text-white/35 text-center mb-5">For {member.name}</p><div className="relative"><input value={val} onChange={(e) => setVal(e.target.value.slice(0, 15))} placeholder="e.g. Bestie, VIP, Brother..." className="w-full h-12 px-5 rounded-full text-[14px] text-white/95 outline-none transition-all text-center placeholder:text-white/25" style={{ background: "linear-gradient(180deg, rgba(15,15,18,1) 0%, rgba(10,10,12,1) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -1px 0 rgba(255,255,255,0.04) inset, 0 2px 4px rgba(0,0,0,0.3) inset" }} autoFocus /></div><div className="text-[11px] text-white/25 mt-2 text-center font-mono">{val.length}/15</div><div className="flex gap-2.5 mt-5">{member.tags.length > 0 && !confirmDelete ? <button onClick={() => setConfirmDelete(true)} className="h-12 px-5 rounded-full font-medium text-[13px] text-red-400/80" style={{ ...CAPSULE_BTN, background: "linear-gradient(180deg, rgba(50,20,20,1) 0%, rgba(25,10,10,1) 100%)" }}><Icon name="Trash" size={15} /></button> : confirmDelete ? <div className="flex gap-2 w-full"><button onClick={() => setConfirmDelete(false)} className="flex-1 h-12 rounded-full text-white/60 font-medium text-[13px]" style={CAPSULE_BTN}>Keep</button><button onClick={removeTag} disabled={loading} className="flex-1 h-12 rounded-full text-red-400/90 font-semibold text-[13px] disabled:opacity-50" style={{ ...CAPSULE_BTN, background: "linear-gradient(180deg, rgba(80,30,30,1) 0%, rgba(40,15,15,1) 100%)" }}>{loading ? "..." : "Delete"}</button></div> : null}<PremiumSaveBtn disabled={!val.trim() || loading} loading={loading} onClick={saveTag} label={member.tags.length > 0 ? "Update" : "Save"} /></div></BottomSheet>;
}

function ConfirmSheet({ title, description, confirmLabel, destructive, busy, onClose, onConfirm }: { title: string; description: string; confirmLabel: string; destructive?: boolean; busy?: boolean; onClose: () => void; onConfirm: () => void; }) {
  return <BottomSheet onClose={onClose}><div className="text-center"><div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={destructive ? { background: "linear-gradient(165deg, rgba(80,30,30,0.7) 0%, rgba(40,15,15,0.7) 60%, rgba(20,8,8,0.7) 100%)", border: "1px solid rgba(255,80,80,0.15)", boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 6px 16px rgba(0,0,0,0.4)" } : ICON_PILL}>{destructive ? <Icon name="Alert" size={22} color="#FCA5A5" /> : <Icon name="Check" size={22} color="rgba(255,255,255,0.7)" />}</div><h3 className="text-[17px] font-bold text-white/90 mb-2">{title}</h3><p className="text-[12px] text-white/35 leading-relaxed px-2">{description}</p><div className="flex gap-2.5 mt-6"><button onClick={onClose} className="flex-1 h-12 rounded-full text-white/65 font-semibold text-[14px]" style={CAPSULE_BTN}>Cancel</button><button disabled={busy} onClick={onConfirm} className={`flex-1 h-12 rounded-full font-semibold text-[14px] ${destructive ? "text-red-200" : "text-black"}`} style={destructive ? { ...CAPSULE_BTN, background: "linear-gradient(180deg, rgba(95,35,35,1) 0%, rgba(45,18,18,1) 100%)" } : SILVER_BTN}>{busy ? "Working..." : confirmLabel}</button></div></div></BottomSheet>;
}

function EditModal({ title, value, maxLen, onSave, onClose }: { title: string; value: string; maxLen: number; onSave: (v: string) => Promise<void>; onClose: () => void; }) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const save = async () => { if (!val.trim() || saving) return; setSaving(true); await onSave(val); setSaving(false); setDone(true); setTimeout(onClose, 300); };
  return <><motion.div {...fadeIn} onClick={onClose} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl" /><motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 16 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="fixed inset-0 z-[80] flex items-center justify-center p-6 pointer-events-none"><div className="w-full max-w-sm pointer-events-auto rounded-[28px] p-6" style={{ background: "linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 32px 80px rgba(0,0,0,0.7)" }}><h3 className="text-[16px] font-bold text-white/90 mb-4">{title}</h3><input value={val} onChange={(e) => setVal(e.target.value.slice(0, maxLen))} className="w-full h-12 px-4 rounded-full text-[14px] text-white/95 outline-none transition-all placeholder:text-white/25" style={{ background: "linear-gradient(180deg, rgba(15,15,18,1) 0%, rgba(10,10,12,1) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -1px 0 rgba(255,255,255,0.04) inset, 0 2px 4px rgba(0,0,0,0.3) inset" }} autoFocus placeholder="Enter name..." /><div className="text-[11px] text-white/25 mt-2 text-right font-mono">{val.length}/{maxLen}</div><div className="flex gap-2.5 mt-5"><button onClick={onClose} className="flex-1 h-12 rounded-full text-white/65 font-semibold text-[14px]" style={CAPSULE_BTN}>Cancel</button><PremiumSaveBtn disabled={!val.trim() || saving} loading={saving} done={done} onClick={save} label="Save" /></div></div></motion.div></>;
}

function EditDescModal({ value, maxLen, onSave, onClose }: { value: string; maxLen: number; onSave: (v: string) => Promise<void>; onClose: () => void; }) {
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const save = async () => { if (saving) return; setSaving(true); await onSave(val); setSaving(false); setDone(true); setTimeout(onClose, 300); };
  return <><motion.div {...fadeIn} onClick={onClose} className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-xl" /><motion.div initial={{ opacity: 0, scale: 0.92, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 16 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="fixed inset-0 z-[80] flex items-center justify-center p-6 pointer-events-none"><div className="w-full max-w-sm pointer-events-auto rounded-[28px] p-6" style={{ background: "linear-gradient(180deg, #1A1A1E 0%, #0E0E12 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 32px 80px rgba(0,0,0,0.7)" }}><h3 className="text-[16px] font-bold text-white/90 mb-3">Edit Description</h3><textarea value={val} onChange={(e) => setVal(e.target.value.slice(0, maxLen))} rows={4} className="w-full px-4 py-3 rounded-[18px] text-[14px] text-white/95 outline-none transition-all resize-none placeholder:text-white/25" style={{ background: "linear-gradient(180deg, rgba(15,15,18,1) 0%, rgba(10,10,12,1) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 -1px 0 rgba(255,255,255,0.04) inset, 0 2px 4px rgba(0,0,0,0.3) inset" }} autoFocus placeholder="Add a description..." /><div className="text-[11px] text-white/25 mt-2 text-right font-mono">{val.length}/{maxLen}</div><div className="flex gap-2.5 mt-5"><button onClick={onClose} className="flex-1 h-12 rounded-full text-white/65 font-semibold text-[14px]" style={CAPSULE_BTN}>Cancel</button><PremiumSaveBtn disabled={saving} loading={saving} done={done} onClick={save} label="Save" /></div></div></motion.div></>;
}

function PremiumSaveBtn({ disabled, loading, done, onClick, label }: { disabled?: boolean; loading?: boolean; done?: boolean; onClick: () => void; label: string; }) {
  return <motion.button whileTap={{ scale: disabled ? 1 : 0.97 }} whileHover={{ y: disabled ? 0 : -1 }} onClick={disabled ? undefined : onClick} className={`flex-1 h-12 rounded-full font-semibold text-black text-[14px] transition-all ${disabled ? 'opacity-40' : ''}`} style={SILVER_BTN}>{loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full mx-auto" /> : done ? <Icon name="Check" size={16} /> : label}</motion.button>;
}
