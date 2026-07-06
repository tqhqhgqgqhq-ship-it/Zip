import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CallSession, acquireLocalMedia, MediaError, type CallRow, type CallKind } from "../lib/webrtc-call";

/* ══════════════════════════════════════════════════════════════════
   NUDGEL CALL SCREEN — faithful rebuild of the master reference:
   BLACK + PURPLE. Full-width bottom control deck (lower third).
   Row 1: Mute · Camera · Speaker · Flip · More (evenly spread).
   Row 2: Chat · End Call hero capsule · Add person.
   NO idle/loop animations — motion only on interaction.
   ══════════════════════════════════════════════════════════════════ */

type CallUiState = "connecting" | "ringing" | "connected" | "ended" | "declined" | "failed";

interface OutgoingProps {
  mode: "outgoing";
  myUid: string;
  myName: string;
  myAvatar: string;
  chatId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  kind: CallKind;
  preAcquiredStream?: MediaStream;
  onClose: () => void;
}

interface IncomingProps {
  mode: "incoming";
  myUid: string;
  call: CallRow;
  onClose: () => void;
}

type Props = OutgoingProps | IncomingProps;

/* ── Reference palette: deep black + premium purple ── */
const PURPLE = "#8B7CF6";        // brand / glow
const PURPLE_SOFT = "rgba(139,124,246,0.35)";
const PURPLE_EDGE = "rgba(139,124,246,0.22)";

const fmtDuration = (s: number) =>
  `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/* ══════════════════════════════════════════════════════════════════
   VOICE-CALL BACKGROUND — randomly picks one of two ambient images
   per call session (chosen once at module use, stable for the call).
   ══════════════════════════════════════════════════════════════════ */
const VOICE_BG_IMAGES = [
  "https://dc.missuo.ru/file/1522531102143676489",
  "https://dc.missuo.ru/file/1522531007797006387",
];
const pickVoiceBg = () => VOICE_BG_IMAGES[Math.floor(Math.random() * VOICE_BG_IMAGES.length)];

/* ══════════════════════════════════════════════════════════════════
   MATERIAL 3 EXPRESSIVE SCALLOP SHAPE
   A smooth flower/scallop outline (12 soft lobes) generated as an
   SVG path, used as a CSS clip-path for the voice-call avatar.
   ══════════════════════════════════════════════════════════════════ */
function makeScallopPath(size: number, lobes = 12, amp = 0.06): string {
  const c = size / 2;
  const R = (size / 2) * 0.88;
  const steps = 240;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = R * (1 + amp * Math.cos(lobes * t));
    const x = c + r * Math.cos(t);
    const y = c + r * Math.sin(t);
    d += (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return d + " Z";
}

const SCALLOP_SIZE = 250;
const SCALLOP_PATH = makeScallopPath(SCALLOP_SIZE);

/** Rotating scallop-clipped avatar. The scallop outline spins slowly
 *  and cleanly while the photo inside counter-rotates so the face
 *  always stays upright. GPU-friendly: pure transform animation. */
function ScallopAvatar({ src }: { src: string }) {
  return (
    <div
      className="relative"
      style={{
        width: SCALLOP_SIZE,
        height: SCALLOP_SIZE,
        filter: "drop-shadow(0 18px 44px rgba(0,0,0,0.55)) drop-shadow(0 0 34px rgba(139,124,246,0.22))",
      }}
    >
      {/* Rotating clip container — the scallop shape itself spins */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 26, ease: "linear" }}
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `path("${SCALLOP_PATH}")`, willChange: "transform" }}
      >
        {/* Counter-rotating photo — stays perfectly upright.
            Oversized so its square always covers the spinning clip. */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 26, ease: "linear" }}
          className="absolute"
          style={{ inset: "-24%", willChange: "transform" }}
        >
          <img src={src} alt="" draggable={false} className="w-full h-full object-cover select-none" />
        </motion.div>
      </motion.div>
    </div>
  );
}

/* Apple-like spring — used ONLY for interactions, never idle loops */
const SPRING = { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.7 };
const SPRING_SOFT = { type: "spring" as const, stiffness: 280, damping: 28 };

export default function CallScreen(props: Props) {
  const isIncoming = props.mode === "incoming";
  const peerName = isIncoming ? props.call.callerName : props.peerName;
  const peerAvatar = isIncoming ? props.call.callerAvatar : props.peerAvatar;
  const kind: CallKind = isIncoming ? props.call.kind : props.kind;

  const [uiState, setUiState] = useState<CallUiState>(isIncoming ? "ringing" : "connecting");
  const [accepted, setAccepted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [cameraSwitchError, setCameraSwitchError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [endReason, setEndReason] = useState<string | null>(null);
  // Random ambient background for voice calls — picked once per call, stable for the session.
  const voiceBgRef = useRef(pickVoiceBg());

  const sessionRef = useRef<CallSession | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const durationTimer = useRef<any>(null);
  const closeTimer = useRef<any>(null);

  const finish = useCallback((reason: string) => {
    setEndReason(reason);
    if (durationTimer.current) clearInterval(durationTimer.current);
    closeTimer.current = setTimeout(() => props.onClose(), 1500);
  }, [props]);

  /* ── PERFORMANCE: while call screen is mounted, mark the app so other
     surfaces can pause their work; also pause body scroll repaint. ── */
  useEffect(() => {
    (window as any).__nudgelCallActive = true;
    document.body.style.overflow = "hidden";
    return () => {
      (window as any).__nudgelCallActive = false;
      document.body.style.overflow = "";
    };
  }, []);

  // ── Session lifecycle ──
  useEffect(() => {
    const session = new CallSession(props.myUid, {
      onRemoteStream: (stream) => {
        if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = stream; remoteVideoRef.current.play().catch(() => {}); }
        if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = stream; remoteAudioRef.current.play().catch(() => {}); }
      },
      onStateChange: (s) => {
        setUiState(s);
        if (s === "connected") {
          if (!durationTimer.current) durationTimer.current = setInterval(() => setDuration((d) => d + 1), 1000);
        }
        if (s === "ended") finish("Call ended");
        if (s === "declined") finish("Call declined");
        if (s === "failed") finish("Connection lost");
      },
    });
    sessionRef.current = session;

    if (!isIncoming) {
      const p = props as OutgoingProps;
      session.startCall({
        chatId: p.chatId, callerName: p.myName, callerAvatar: p.myAvatar,
        calleeId: p.peerId, kind: p.kind, stream: p.preAcquiredStream,
      }).then(() => {
        if (localVideoRef.current && session.localStream) {
          localVideoRef.current.srcObject = session.localStream;
          localVideoRef.current.play().catch(() => {});
        }
      }).catch((e: any) => {
        const msg = (e instanceof MediaError) ? e.message : (e?.message || "Could not start call");
        finish(msg);
      });
    }

    return () => {
      if (durationTimer.current) clearInterval(durationTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      session.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAccept = async () => {
    if (!isIncoming || accepted) return;
    const p = props as IncomingProps;
    let stream: MediaStream | undefined;
    try {
      stream = await acquireLocalMedia(p.call.kind);
    } catch (e: any) {
      const msg = (e instanceof MediaError) ? e.message : (e?.message || "Could not access microphone / camera");
      finish(msg);
      return;
    }
    setAccepted(true);
    try {
      await sessionRef.current!.acceptCall(p.call, stream);
      if (localVideoRef.current && sessionRef.current!.localStream) {
        localVideoRef.current.srcObject = sessionRef.current!.localStream;
        localVideoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      finish(e?.message || "Failed to accept call");
    }
  };

  const handleDecline = () => {
    if (isIncoming) sessionRef.current?.decline((props as IncomingProps).call.id);
    finish("Call declined");
  };

  const handleHangUp = () => { sessionRef.current?.hangUp(); };
  const handleMute = () => setMuted(sessionRef.current?.toggleMute() ?? false);
  const handleCam = () => setCamOff(sessionRef.current?.toggleCamera() ?? false);
  const handleFlip = async () => {
    if (!isVideo || switchingCamera) return;
    const nextFacing: "user" | "environment" = flipped ? "user" : "environment";
    setSwitchingCamera(true);
    setCameraSwitchError(null);
    try {
      await sessionRef.current?.switchCameraFacing(nextFacing);
      // Refresh the local preview element with the swapped stream
      if (localVideoRef.current && sessionRef.current?.localStream) {
        localVideoRef.current.srcObject = sessionRef.current.localStream;
        localVideoRef.current.play().catch(() => {});
      }
      setFlipped(!flipped);
    } catch (e: any) {
      console.warn("Camera switch failed:", e);
      const msg = e instanceof MediaError ? e.message : "Back camera unavailable or blocked by the browser.";
      setCameraSwitchError(msg);
      setTimeout(() => setCameraSwitchError(null), 3500);
    } finally {
      setSwitchingCamera(false);
    }
  };
  const handleSpeaker = () => {
    setSpeakerOn((v) => {
      const next = !v;
      if (remoteAudioRef.current) remoteAudioRef.current.muted = !next;
      if (remoteVideoRef.current) remoteVideoRef.current.muted = !next;
      return next;
    });
  };

  const statusLabel =
    endReason ? endReason :
    uiState === "connecting" ? "Connecting…" :
    uiState === "ringing" ? (isIncoming && !accepted ? "Incoming call…" : "Ringing…") :
    uiState === "connected" ? fmtDuration(duration) : "";

  const showIncomingButtons = isIncoming && !accepted && !endReason;
  const isVideo = kind === "video";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      className="fixed inset-0 z-[200] flex flex-col overflow-hidden select-none"
      style={{ background: "#08070C" }}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline hidden />

      {/* ══ BACKDROP — black with purple ambient pools (matches reference) ══ */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `
          radial-gradient(90% 55% at 15% 30%, rgba(110,90,220,0.20) 0%, transparent 55%),
          radial-gradient(80% 50% at 90% 45%, rgba(120,95,235,0.16) 0%, transparent 55%),
          radial-gradient(100% 45% at 50% 100%, rgba(90,70,190,0.12) 0%, transparent 60%),
          linear-gradient(180deg, #0B0A12 0%, #08070C 55%, #060509 100%)
        `
      }} />

      {/* ══ REMOTE VIDEO — full bleed ══ */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: isVideo && uiState === "connected" ? 1 : 0, transition: "opacity 0.5s ease" }}
      />
      {!(isVideo && uiState === "connected") && (
        <div className="absolute inset-0" style={{
          backgroundImage: `url(${isVideo ? peerAvatar : voiceBgRef.current})`,
          backgroundSize: "cover",
          backgroundPosition: isVideo ? "center 22%" : "center",
          filter: isVideo ? "blur(1.5px) brightness(0.6) saturate(1.1)" : "brightness(0.75) saturate(1.05)",
          transform: "scale(1.06)",
        }} />
      )}
      {/* legibility vignettes — top for header, bottom for deck */}
      <div className="absolute inset-x-0 top-0 h-64 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(6,5,10,0.85) 0%, rgba(6,5,10,0.35) 55%, transparent 100%)" }} />
      <div className="absolute inset-x-0 bottom-0 h-[44%] pointer-events-none" style={{ background: "linear-gradient(0deg, rgba(5,4,9,0.92) 0%, rgba(5,4,9,0.45) 60%, transparent 100%)" }} />

      {/* ══════════════════════════════════════════════════════════ */}
      {/* HEADER — back | Nudgel / Name+badge / Encrypted / Timer | add */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="relative z-20 flex items-start justify-between px-5 pt-[calc(env(safe-area-inset-top)+16px)]">
        <SquareGlassBtn onClick={props.onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </SquareGlassBtn>

        <div className="flex flex-col items-center flex-1 min-w-0 px-3 pt-0.5">
          <span className="text-[16px] font-semibold tracking-tight mb-1.5" style={{ color: PURPLE, textShadow: `0 0 18px ${PURPLE_SOFT}` }}>
            Nudgel
          </span>

          <div className="flex items-center gap-2 max-w-full">
            <span className="text-[26px] font-bold text-white tracking-tight truncate" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.6)" }}>
              {peerName}
            </span>
            <VerifiedBadge />
          </div>

          <div className="flex items-center gap-1.5 mt-2.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#34D399"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 018 0v3" fill="none" stroke="#34D399" strokeWidth="2.2"/></svg>
            <span className="text-[13.5px] font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>End-to-end Encrypted</span>
          </div>

          <span className={`mt-2.5 text-[15px] font-medium tabular-nums ${endReason ? "text-red-400/90" : "text-white/75"}`}>
            {statusLabel}
          </span>
        </div>

        <SquareGlassBtn onClick={() => {}}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
        </SquareGlassBtn>
      </div>

      <AnimatePresence>
        {cameraSwitchError && (
          <motion.div
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -18, opacity: 0 }}
            transition={SPRING_SOFT}
            className="absolute left-4 right-4 z-30 mx-auto rounded-2xl px-4 py-3 text-center"
            style={{
              top: "calc(env(safe-area-inset-top) + 104px)",
              background: "rgba(20,12,28,0.88)",
              border: "1px solid rgba(139,124,246,0.24)",
              backdropFilter: "blur(18px)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
            }}
          >
            <span className="text-[12.5px] font-medium text-white/75">{cameraSwitchError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* SELF PiP — top-right, purple border, flip button inside     */}
      {/* ══════════════════════════════════════════════════════════ */}
      {isVideo && (
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.1}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, ...SPRING_SOFT }}
          className="absolute z-20 overflow-hidden cursor-grab active:cursor-grabbing"
          style={{
            top: "calc(env(safe-area-inset-top) + 170px)",
            right: 18,
            width: 168,
            height: 238,
            borderRadius: 26,
            background: "linear-gradient(170deg, #17141F 0%, #0B0A12 100%)",
            border: `1.5px solid ${PURPLE_EDGE}`,
            boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.5), 0 0 26px rgba(120,95,235,0.10)`,
          }}
        >
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: flipped ? "scaleX(1)" : "scaleX(-1)", opacity: camOff ? 0 : 1, transition: "opacity 0.25s ease" }}
          />
          {camOff && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "linear-gradient(170deg, #17141F, #0B0A12)" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1l22 22M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2v-4"/></svg>
            </div>
          )}
          {/* flip button — bottom-right, dark circle, exactly like reference */}
          <motion.button
            whileTap={{ scale: 0.86 }}
            transition={SPRING}
            onClick={(e) => { e.stopPropagation(); handleFlip(); }}
            className="absolute bottom-2.5 right-2.5 flex items-center justify-center"
            style={{
              width: 40, height: 40, borderRadius: 20,
              background: "rgba(14,12,20,0.78)",
              border: "1px solid rgba(255,255,255,0.16)",
              backdropFilter: "blur(10px)",
            }}
          >
            {switchingCamera ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            ) : (
              <FlipIcon size={17} />
            )}
          </motion.button>
        </motion.div>
      )}

      {/* ══ VOICE CALL — rotating Material 3 Expressive scallop avatar ══ */}
      {!isVideo ? (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <ScallopAvatar src={peerAvatar} />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* CONTROL DECK — full-width panel, lower third, black glass   */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="relative z-20 pb-[calc(env(safe-area-inset-bottom)+8px)]" style={{ paddingLeft: "max(env(safe-area-inset-left), 6px)", paddingRight: "max(env(safe-area-inset-right), 6px)" }}>
        <AnimatePresence mode="wait">
          {showIncomingButtons ? (
            <motion.div
              key="incoming"
              initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }}
              transition={SPRING_SOFT}
              className="w-full rounded-[32px] px-8 pt-9 pb-10 relative overflow-hidden"
              style={DECK_STYLE}
            >
              <div className="relative flex items-center justify-around">
                <div className="flex flex-col items-center gap-3">
                  <motion.button whileTap={{ scale: 0.9 }} transition={SPRING} onClick={handleDecline}
                    className="flex items-center justify-center"
                    style={{
                      width: 74, height: 74, borderRadius: 37,
                      background: "linear-gradient(172deg, #E96A6A 0%, #C93B3B 48%, #8F2424 100%)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      boxShadow: "0 2px 0 rgba(255,255,255,0.3) inset, 0 -4px 8px rgba(0,0,0,0.35) inset, 0 14px 34px rgba(180,45,45,0.42)",
                    }}>
                    <PhoneDownIcon size={28} />
                  </motion.button>
                  <span className="text-[13px] font-medium text-white/55">Decline</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <motion.button whileTap={{ scale: 0.9 }} transition={SPRING} onClick={handleAccept}
                    className="flex items-center justify-center"
                    style={{
                      width: 74, height: 74, borderRadius: 37,
                      background: "linear-gradient(172deg, #52E08D 0%, #22B45E 48%, #157A3E 100%)",
                      border: "1px solid rgba(255,255,255,0.16)",
                      boxShadow: "0 2px 0 rgba(255,255,255,0.32) inset, 0 -4px 8px rgba(0,0,0,0.3) inset, 0 14px 34px rgba(34,180,94,0.4)",
                    }}>
                    {kind === "video" ? (
                      <svg width="27" height="27" viewBox="0 0 24 24" fill="white"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                    ) : (
                      <svg width="27" height="27" viewBox="0 0 24 24" fill="white"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                    )}
                  </motion.button>
                  <span className="text-[13px] font-medium text-white/55">Accept</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="deck"
              initial={{ y: 56, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 56, opacity: 0 }}
              transition={SPRING_SOFT}
              className="w-full rounded-[32px] pt-7 pb-7 px-4 relative overflow-hidden"
              style={DECK_STYLE}
            >
              {/* Row 1 — four controls spread across the full panel width */}
              <div className="relative flex items-start justify-between mb-7 px-1">
                <DeckButton active={muted} onClick={handleMute} label="Mute">
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </DeckButton>
                <DeckButton active={isVideo && !camOff} onClick={isVideo ? handleCam : undefined} label="Camera" disabled={!isVideo}>
                  {camOff ? <CamOffIcon /> : <CamIcon />}
                </DeckButton>
                <DeckButton active={speakerOn} onClick={handleSpeaker} label="Speaker">
                  {speakerOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
                </DeckButton>
                <DeckButton active={flipped} onClick={isVideo ? handleFlip : undefined} label="Flip" disabled={!isVideo}>
                  <FlipBoxIcon />
                </DeckButton>
              </div>

              {/* Row 2 — chat | End Call hero | add person */}
              <div className="relative flex items-center justify-between">
                <CircleGlassBtn onClick={() => {}}>
                  <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
                </CircleGlassBtn>

                <EndCallButton onClick={handleHangUp} />

                <CircleGlassBtn onClick={() => {}}>
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
                </CircleGlassBtn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   STYLE TOKENS — black crystal deck, purple edge light
   ══════════════════════════════════════════════════════════════════ */
const DECK_STYLE: React.CSSProperties = {
  background: "linear-gradient(178deg, rgba(20,17,28,0.86) 0%, rgba(12,10,18,0.92) 50%, rgba(8,7,13,0.95) 100%)",
  border: "1px solid rgba(139,124,246,0.14)",
  boxShadow: `
    0 1px 0 rgba(190,180,255,0.10) inset,
    0 -1px 0 rgba(0,0,0,0.55) inset,
    0 -18px 60px rgba(0,0,0,0.5)
  `,
  backdropFilter: "blur(30px) saturate(130%)",
  WebkitBackdropFilter: "blur(30px) saturate(130%)",
};

/* ── Header square glass button (rounded square, purple tint) ── */
function SquareGlassBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={SPRING}
      onClick={onClick}
      className="relative flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: 52, height: 52, borderRadius: 18,
        background: "linear-gradient(168deg, rgba(40,34,58,0.55) 0%, rgba(16,14,24,0.72) 100%)",
        border: `1px solid ${PURPLE_EDGE}`,
        boxShadow: "0 1px 0 rgba(190,180,255,0.14) inset, 0 8px 22px rgba(0,0,0,0.45)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(200,190,255,0.07), transparent)" }} />
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/* ── Verified badge — purple flower seal with white check ── */
function VerifiedBadge() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" className="flex-shrink-0" style={{ filter: `drop-shadow(0 0 6px ${PURPLE_SOFT})` }}>
      <path d="M12 1.5l2.1 1.6 2.6-.4 1.1 2.4 2.4 1.1-.4 2.6 1.6 2.1-1.6 2.1.4 2.6-2.4 1.1-1.1 2.4-2.6-.4-2.1 1.6-2.1-1.6-2.6.4-1.1-2.4-2.4-1.1.4-2.6L2.5 12l1.6-2.1-.4-2.6 2.4-1.1 1.1-2.4 2.6.4z" fill={PURPLE} />
      <path d="M8.6 12.1l2.2 2.2 4.6-4.9" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════
   DECK CIRCLE BUTTON — deep black, purple edge light; the active
   (highlighted) one gets the purple ring exactly like the reference.
   Motion ONLY on tap.
   ══════════════════════════════════════════════════════════════════ */
function DeckButton({ children, active, onClick, label, disabled }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void; label: string; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 flex-1">
      <motion.button
        whileTap={disabled ? undefined : { scale: 0.86 }}
        transition={SPRING}
        onClick={disabled ? undefined : onClick}
        className="relative flex items-center justify-center overflow-hidden"
        style={{
          width: 68, height: 68, borderRadius: 34,
          /* BLACK by default → PURPLE gradient (light from the top) when active */
          background: active
            ? "linear-gradient(180deg, #A08FFF 0%, #7C68E8 34%, #4F3DBA 68%, #2E2378 100%)"
            : "linear-gradient(172deg, #1B1824 0%, #100E16 55%, #09080D 100%)",
          border: active ? "1.5px solid rgba(190,178,255,0.65)" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: active
            ? `0 2px 0 rgba(230,224,255,0.45) inset, 0 -4px 8px rgba(20,10,60,0.5) inset, 0 0 26px rgba(139,124,246,0.45), 0 10px 24px rgba(0,0,0,0.45)`
            : `0 1px 0 rgba(200,190,255,0.09) inset, 0 -3px 6px rgba(0,0,0,0.5) inset, 0 8px 20px rgba(0,0,0,0.45)`,
          opacity: disabled ? 0.35 : 1,
          transition: "background 0.25s ease, border 0.25s ease, box-shadow 0.25s ease",
        }}
      >
        {/* top light sheen — brighter on active purple state */}
        <div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full"
          style={{ background: active
            ? "linear-gradient(180deg, rgba(255,255,255,0.30), transparent)"
            : "linear-gradient(180deg, rgba(210,200,255,0.07), transparent)" }} />
        <span className="relative flex items-center justify-center" style={{ color: "rgba(255,255,255,0.96)" }}>
          {children}
        </span>
      </motion.button>
      <span className="text-[13px] font-medium" style={{ color: active ? "rgba(200,190,255,0.95)" : "rgba(255,255,255,0.8)" }}>{label}</span>
    </div>
  );
}

/* ── Row-2 side circles (chat / add person) — same black glass ── */
function CircleGlassBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      transition={SPRING}
      onClick={onClick}
      className="relative flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: 62, height: 62, borderRadius: 31,
        background: "linear-gradient(172deg, #1D1927 0%, #100E17 60%, #0A090F 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 1px 0 rgba(200,190,255,0.10) inset, 0 -3px 6px rgba(0,0,0,0.45) inset, 0 8px 20px rgba(0,0,0,0.42)",
      }}
    >
      <div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none rounded-t-full" style={{ background: "linear-gradient(180deg, rgba(210,200,255,0.07), transparent)" }} />
      <span className="relative">{children}</span>
    </motion.button>
  );
}

/* ══════════════════════════════════════════════════════════════════
   END CALL — hero capsule. Deep glossy red, static (no idle motion),
   natural compression on press only.
   ══════════════════════════════════════════════════════════════════ */
function EndCallButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97, y: 1 }}
      transition={SPRING}
      className="relative flex items-center justify-center gap-3 overflow-hidden flex-1 mx-3"
      style={{
        height: 58, borderRadius: 29,
        /* Clean premium red — soft radial lift in the center, like the reference */
        background: "radial-gradient(120% 160% at 50% 0%, #E8767A 0%, #D75A5F 40%, #C24449 72%, #A93338 100%)",
        border: "1px solid rgba(255,255,255,0.13)",
        boxShadow: `
          0 1px 0 rgba(255,255,255,0.28) inset,
          0 -1px 0 rgba(80,15,20,0.5) inset,
          0 10px 28px rgba(150,40,50,0.35),
          0 4px 12px rgba(0,0,0,0.35)
        `,
      }}
    >
      {/* subtle top highlight — soft, flat, not inflated */}
      <div className="absolute top-0 inset-x-0 h-1/2 pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12), transparent)" }} />
      <PhoneDownIcon size={21} />
      <span className="relative text-white font-semibold text-[18px] tracking-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>End Call</span>
    </motion.button>
  );
}

/* ── Icon set — uniform, rounded, optically centered ── */
const ip = { viewBox: "0 0 24 24", fill: "none" as const, stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function MicIcon() { return <svg width="22" height="22" {...ip}><path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3"/></svg>; }
function MicOffIcon() { return <svg width="22" height="22" {...ip}><path d="M2 2l20 20M9 9v3a3 3 0 005.12 2.12M15 9.34V5a3 3 0 00-5.94-.6"/><path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .74-.11 1.45-.32 2.11"/><path d="M12 19v3"/></svg>; }
function CamIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 10.5V7.75A1.75 1.75 0 0013.75 6h-9A1.75 1.75 0 003 7.75v8.5A1.75 1.75 0 004.75 18h9a1.75 1.75 0 001.75-1.75V13.5l4.3 3.44a.6.6 0 00.95-.49V7.55a.6.6 0 00-.95-.49l-4.3 3.44z"/></svg>; }
function CamOffIcon() { return <svg width="22" height="22" {...ip}><path d="M2 2l20 20M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2v-4"/></svg>; }
function SpeakerIcon() { return <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9.5v5a1 1 0 001 1h2.6l3.7 3.2a.8.8 0 001.32-.61V5.9a.8.8 0 00-1.32-.6L7.6 8.5H5a1 1 0 00-1 1z"/><path d="M15.6 8.2a5.4 5.4 0 010 7.6M18.2 5.6a9 9 0 010 12.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>; }
function SpeakerOffIcon() { return <svg width="22" height="22" {...ip}><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>; }
function FlipBoxIcon() { return <svg width="22" height="22" {...ip}><path d="M11 19H4a2 2 0 01-2-2V7a2 2 0 012-2h5"/><path d="M13 5h7a2 2 0 012 2v10a2 2 0 01-2 2h-5"/><path d="M15 2l3 3-3 3"/><path d="M9 22l-3-3 3-3"/></svg>; }
function FlipIcon({ size = 17 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>; }
function PhoneDownIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="white" className="relative">
      <path d="M12 9c-3.5 0-6.7 1.1-9.3 3a1.5 1.5 0 00-.35 2.1l1.3 1.8a1.5 1.5 0 001.95.43l2.5-1.4a1.5 1.5 0 00.76-1.15l.18-1.6a13.2 13.2 0 015.92 0l.18 1.6c.06.48.35.9.76 1.15l2.5 1.4a1.5 1.5 0 001.95-.43l1.3-1.8a1.5 1.5 0 00-.35-2.1A15.8 15.8 0 0012 9z"/>
    </svg>
  );
}
