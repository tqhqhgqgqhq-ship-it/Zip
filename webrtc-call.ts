/* ══════════════════════════════════════════════════════════════════
   REAL WEBRTC CALLING ENGINE
   Peer-to-peer voice & video calls using WebRTC.
   Signaling (offer/answer/ICE) travels through the Turso DB the same
   way messages do — no extra server needed.
   ══════════════════════════════════════════════════════════════════ */
import { dbClient } from "./turso";

export type CallKind = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "ended" | "missed";

export interface CallRow {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  calleeId: string;
  kind: CallKind;
  status: CallStatus;
  offer: string | null;
  answer: string | null;
  createdAt: number;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

/* ══════════════════════════════════════════════════════════════════
   MEDIA ACQUISITION — honest, verbose, works everywhere it can
   ══════════════════════════════════════════════════════════════════ */
export class MediaError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** Acquire microphone / camera with clear, actionable errors. */
export async function acquireLocalMedia(kind: CallKind, facing: "user" | "environment" = "user"): Promise<MediaStream> {
  // 1. Feature detection — mediaDevices doesn't exist on non-secure contexts
  if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    const secure = typeof window !== "undefined" ? window.isSecureContext : false;
    throw new MediaError(
      "insecure",
      secure
        ? "This browser does not support camera / microphone access."
        : "Camera & microphone require HTTPS. Open the app on a secure (https://) URL."
    );
  }

  const constraints: MediaStreamConstraints = {
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: kind === "video" ? { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err: any) {
    const name = err?.name || "";
    // Retry video calls with audio-only if the camera fails but the mic works.
    if (kind === "video" && (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError")) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio, video: false });
        return stream;
      } catch (e2: any) {
        throw humanizeMediaError(e2);
      }
    }
    throw humanizeMediaError(err);
  }
}

function humanizeMediaError(err: any): MediaError {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new MediaError("denied", "Permission denied. Allow microphone / camera access in your browser settings, then try again.");
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MediaError("missing", "No microphone or camera found on this device.");
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new MediaError("busy", "Microphone / camera is already in use by another app.");
  }
  if (name === "OverconstrainedError") {
    return new MediaError("constraints", "Your camera does not support the requested settings.");
  }
  if (name === "SecurityError") {
    return new MediaError("insecure", "Blocked for security reasons. Ensure the page is served over HTTPS.");
  }
  return new MediaError("unknown", err?.message || "Could not access microphone / camera.");
}

let _schemaReady: Promise<void> | null = null;
async function ensureCallSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const c = dbClient();
      await c.execute({
        sql: `CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          caller_id TEXT NOT NULL,
          caller_name TEXT NOT NULL DEFAULT '',
          caller_avatar TEXT NOT NULL DEFAULT '',
          callee_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'voice',
          status TEXT NOT NULL DEFAULT 'ringing',
          offer TEXT,
          answer TEXT,
          created_at INTEGER NOT NULL
        )`,
      });
      await c.execute({
        sql: `CREATE TABLE IF NOT EXISTS call_candidates (
          id TEXT PRIMARY KEY,
          call_id TEXT NOT NULL,
          from_user TEXT NOT NULL,
          candidate TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
      });
      try { await c.execute({ sql: `CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id, status)` }); } catch {}
      try { await c.execute({ sql: `CREATE INDEX IF NOT EXISTS idx_cand_call ON call_candidates(call_id)` }); } catch {}
    })().catch((e) => { _schemaReady = null; throw e; });
  }
  return _schemaReady;
}

/* ── Signaling primitives ── */

export async function createCall(args: {
  chatId: string; callerId: string; callerName: string; callerAvatar: string;
  calleeId: string; kind: CallKind; offerSdp: string;
}): Promise<string> {
  await ensureCallSchema();
  const id = crypto.randomUUID();
  await dbClient().execute({
    sql: `INSERT INTO calls (id, chat_id, caller_id, caller_name, caller_avatar, callee_id, kind, status, offer, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ringing', ?, ?)`,
    args: [id, args.chatId, args.callerId, args.callerName, args.callerAvatar, args.calleeId, args.kind, args.offerSdp, Date.now()],
  });
  return id;
}

export async function getCall(callId: string): Promise<CallRow | null> {
  await ensureCallSchema();
  const res = await dbClient().execute({ sql: "SELECT * FROM calls WHERE id = ?", args: [callId] });
  if (res.rows.length === 0) return null;
  const r: any = res.rows[0];
  return {
    id: String(r.id), chatId: String(r.chat_id), callerId: String(r.caller_id),
    callerName: String(r.caller_name), callerAvatar: String(r.caller_avatar),
    calleeId: String(r.callee_id), kind: (String(r.kind) as CallKind),
    status: (String(r.status) as CallStatus),
    offer: r.offer ? String(r.offer) : null, answer: r.answer ? String(r.answer) : null,
    createdAt: Number(r.created_at) || 0,
  };
}

/** Callee: find a fresh incoming ringing call (< 45s old). */
export async function findIncomingCall(myUid: string): Promise<CallRow | null> {
  await ensureCallSchema();
  const res = await dbClient().execute({
    sql: "SELECT * FROM calls WHERE callee_id = ? AND status = 'ringing' AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    args: [myUid, Date.now() - 45_000],
  });
  if (res.rows.length === 0) return null;
  const r: any = res.rows[0];
  return {
    id: String(r.id), chatId: String(r.chat_id), callerId: String(r.caller_id),
    callerName: String(r.caller_name), callerAvatar: String(r.caller_avatar),
    calleeId: String(r.callee_id), kind: (String(r.kind) as CallKind),
    status: (String(r.status) as CallStatus),
    offer: r.offer ? String(r.offer) : null, answer: r.answer ? String(r.answer) : null,
    createdAt: Number(r.created_at) || 0,
  };
}

export async function setCallAnswer(callId: string, answerSdp: string): Promise<void> {
  await dbClient().execute({
    sql: "UPDATE calls SET answer = ?, status = 'accepted' WHERE id = ?",
    args: [answerSdp, callId],
  });
}

export async function setCallStatus(callId: string, status: CallStatus): Promise<void> {
  await ensureCallSchema();
  await dbClient().execute({ sql: "UPDATE calls SET status = ? WHERE id = ?", args: [status, callId] });
}

export async function addIceCandidate(callId: string, fromUid: string, candidate: RTCIceCandidateInit): Promise<void> {
  await dbClient().execute({
    sql: "INSERT INTO call_candidates (id, call_id, from_user, candidate, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), callId, fromUid, JSON.stringify(candidate), Date.now()],
  });
}

export async function fetchIceCandidates(callId: string, excludeUid: string, afterTs: number): Promise<{ candidate: RTCIceCandidateInit; ts: number }[]> {
  const res = await dbClient().execute({
    sql: "SELECT candidate, created_at FROM call_candidates WHERE call_id = ? AND from_user != ? AND created_at > ? ORDER BY created_at ASC",
    args: [callId, excludeUid, afterTs],
  });
  return (res.rows as any[]).map((r) => ({ candidate: JSON.parse(String(r.candidate)), ts: Number(r.created_at) }));
}

/* ══════════════════════════════════════════════════════════════════
   HIGH-LEVEL CALL SESSION
   Manages RTCPeerConnection + media + signaling polling in one object.
   ══════════════════════════════════════════════════════════════════ */
export interface CallSessionCallbacks {
  onRemoteStream: (stream: MediaStream) => void;
  onStateChange: (state: "connecting" | "ringing" | "connected" | "ended" | "declined" | "failed") => void;
}

export class CallSession {
  pc: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;
  callId: string | null = null;
  private pollTimer: any = null;
  private lastCandTs = 0;
  private myUid: string;
  private cb: CallSessionCallbacks;
  private closed = false;

  constructor(myUid: string, cb: CallSessionCallbacks) {
    this.myUid = myUid;
    this.cb = cb;
  }

  private async setupPeer(kind: CallKind, preAcquiredStream?: MediaStream): Promise<void> {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    if (preAcquiredStream) {
      this.localStream = preAcquiredStream;
    } else {
      this.localStream = await acquireLocalMedia(kind);
    }
    for (const track of this.localStream.getTracks()) {
      this.pc.addTrack(track, this.localStream);
    }
    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.cb.onRemoteStream(e.streams[0]);
    };
    this.pc.onicecandidate = (e) => {
      if (e.candidate && this.callId) {
        addIceCandidate(this.callId, this.myUid, e.candidate.toJSON()).catch(() => {});
      }
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if (s === "connected") this.cb.onStateChange("connected");
      else if (s === "failed" || s === "disconnected") { if (!this.closed) this.cb.onStateChange("failed"); }
    };
  }

  /** CALLER: start an outgoing call. Optionally pass a pre-acquired stream
   *  so the getUserMedia prompt happens on the user's click (same call stack)
   *  instead of inside a useEffect (which some browsers block). */
  async startCall(args: {
    chatId: string; callerName: string; callerAvatar: string;
    calleeId: string; kind: CallKind; stream?: MediaStream;
  }): Promise<void> {
    this.cb.onStateChange("connecting");
    await this.setupPeer(args.kind, args.stream);
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    this.callId = await createCall({
      chatId: args.chatId, callerId: this.myUid, callerName: args.callerName,
      callerAvatar: args.callerAvatar, calleeId: args.calleeId, kind: args.kind,
      offerSdp: JSON.stringify(offer),
    });
    this.cb.onStateChange("ringing");
    // Poll for answer + candidates + status
    this.pollTimer = setInterval(async () => {
      if (this.closed || !this.callId) return;
      try {
        const call = await getCall(this.callId);
        if (!call) return;
        if (call.status === "declined") { this.cb.onStateChange("declined"); this.close(false); return; }
        if (call.status === "ended") { this.cb.onStateChange("ended"); this.close(false); return; }
        if (call.answer && this.pc && !this.pc.currentRemoteDescription) {
          await this.pc.setRemoteDescription(JSON.parse(call.answer));
        }
        await this.drainCandidates();
      } catch {}
    }, 1200);
  }

  /** CALLEE: accept an incoming call. Optionally pass a pre-acquired stream. */
  async acceptCall(call: CallRow, stream?: MediaStream): Promise<void> {
    this.callId = call.id;
    this.cb.onStateChange("connecting");
    await this.setupPeer(call.kind, stream);
    await this.pc!.setRemoteDescription(JSON.parse(call.offer!));
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    await setCallAnswer(call.id, JSON.stringify(answer));
    this.pollTimer = setInterval(async () => {
      if (this.closed || !this.callId) return;
      try {
        const c = await getCall(this.callId);
        if (c && (c.status === "ended")) { this.cb.onStateChange("ended"); this.close(false); return; }
        await this.drainCandidates();
      } catch {}
    }, 1200);
  }

  private async drainCandidates(): Promise<void> {
    if (!this.callId || !this.pc) return;
    const cands = await fetchIceCandidates(this.callId, this.myUid, this.lastCandTs);
    for (const { candidate, ts } of cands) {
      this.lastCandTs = Math.max(this.lastCandTs, ts);
      try { await this.pc.addIceCandidate(candidate); } catch {}
    }
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled; // returns muted state
  }

  /** Hot-swap the video track to the requested facing camera without
   *  dropping the peer connection. Returns the resulting facing mode. */
  async switchCameraFacing(facing: "user" | "environment"): Promise<"user" | "environment"> {
    if (!this.pc || !this.localStream) return "user";

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new MediaError("insecure", "Camera switching requires browser camera permission on a secure HTTPS page.");
    }

    const oldTrack = this.localStream.getVideoTracks()[0];
    const sender = this.pc.getSenders().find((s) => s.track && s.track.kind === "video");

    // Android/WebView often cannot open a second camera while the first one is
    // active. Release the current camera before asking for the opposite lens.
    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      try { oldTrack.stop(); } catch {}
    }

    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (exactErr) {
      // Some browsers reject exact constraints even when the lens exists.
      // Retry with ideal constraints, which still opens the requested camera on
      // most Android devices but is less strict.
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (idealErr) {
        // Restore a working camera if switching failed, so the call is not left
        // without video.
        const fallbackFacing = facing === "environment" ? "user" : "environment";
        try {
          const fallback = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: fallbackFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
          const fallbackTrack = fallback.getVideoTracks()[0];
          if (fallbackTrack) {
            if (sender) await sender.replaceTrack(fallbackTrack);
            this.localStream.addTrack(fallbackTrack);
          }
        } catch {}
        throw humanizeMediaError(idealErr || exactErr);
      }
    }

    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) throw new MediaError("missing", "No camera track was returned by the browser.");
    // Replace on the peer connection so the remote side sees the switch.
    if (sender) await sender.replaceTrack(newTrack);
    this.localStream.addTrack(newTrack);
    return facing;
  }

  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled; // returns camera-off state
  }

  /** Hang up (notifies the other side). */
  async hangUp(): Promise<void> {
    if (this.callId) { setCallStatus(this.callId, "ended").catch(() => {}); }
    this.close(false);
    this.cb.onStateChange("ended");
  }

  async decline(callId: string): Promise<void> {
    setCallStatus(callId, "declined").catch(() => {});
    this.close(false);
  }

  close(_notify = true): void {
    this.closed = true;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    try { this.pc?.close(); } catch {}
    this.pc = null;
  }
}
