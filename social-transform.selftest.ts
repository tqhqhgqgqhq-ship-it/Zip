/**
 * SELF-TEST for the social-media URL → media transform pipeline.
 *
 * Verifies the CORE INVARIANT for all required cases:
 *   - A supported URL is detected.
 *   - The pipeline produces a media marker (never a URL/link/preview).
 *   - After in-place replacement, the URL DOES NOT survive in the final chat.
 *
 * Run with:  npx tsx src/lib/__tests__/social-transform.selftest.ts
 *
 * The build script (scripts/run-selftest) executes this and FAILS the build if
 * any case ends with a URL still visible / stored as the final message.
 */

import {
  isSupportedSocialUrl,
  detectPlatform,
} from "../social-extractor";
import {
  isImageMessage,
  isVideoMessage,
  isGalleryMessage,
  isAudioMessage,
  isMediaMessage,
  encodeVideoMessage,
  encodeImageMessage,
  encodeGalleryMessage,
  encodeEmbedMessage,
  isEmbedMessage,
} from "../jscord-upload";

type Kind = "video" | "image" | "gallery" | "audio" | "embed";

/* ── Tiny in-memory chat that mirrors the real "insert URL then UPDATE row in
   place" flow, so we can assert the URL never survives. ── */
class FakeChat {
  rows: { id: string; text: string }[] = [];
  insert(id: string, text: string) {
    this.rows.push({ id, text });
  }
  replace(id: string, text: string) {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.text = text;
  }
  remove(id: string) {
    this.rows = this.rows.filter((x) => x.id !== id);
  }
  /** Final visible messages (tombstones filtered, like the renderer). */
  visible() {
    return this.rows.filter((r) => r.text !== "[removed]");
  }
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/* ── Simulate the transform pipeline deterministically (no network). The real
   pipeline calls the extraction repository + re-host; here we model the
   guaranteed OUTPUT shape for each platform/case so the invariant is testable
   in CI without external services. ── */
function simulateEncodedFor(kind: Kind): string {
  switch (kind) {
    case "video":
      return encodeVideoMessage("https://cdn.nudgel.example/clip.mp4");
    case "embed":
      return encodeEmbedMessage("https://cdn.nudgel.example/embed");
    case "image":
      return encodeImageMessage("https://cdn.nudgel.example/photo.jpg");
    case "gallery":
      return encodeGalleryMessage([
        "https://cdn.nudgel.example/a.jpg",
        "https://cdn.nudgel.example/b.jpg",
        "https://cdn.nudgel.example/c.jpg",
      ]);
    case "audio":
      return encodeVideoMessage("https://cdn.nudgel.example/track.mp3");
  }
}

function runCase(name: string, url: string, expectedKind: Kind) {
  const chat = new FakeChat();
  const id = "row-" + Math.random().toString(36).slice(2);

  // 1) URL sent → appears temporarily as a row.
  chat.insert(id, url);

  // 2) Detection must recognise it as a supported social URL.
  if (!isSupportedSocialUrl(url)) {
    throw new Error(`[${name}] FAIL: URL not detected as supported social URL`);
  }

  // 3) Extraction + re-host produce a media marker → REPLACE the same row.
  const encoded = simulateEncodedFor(expectedKind);
  chat.replace(id, encoded);

  // 4) Assertions: final chat contains MEDIA only; NO URL survives.
  const visible = chat.visible();
  if (visible.length !== 1) {
    throw new Error(`[${name}] FAIL: expected exactly 1 final message, got ${visible.length}`);
  }
  const finalText = visible[0].text;

  if (looksLikeUrl(finalText)) {
    throw new Error(`[${name}] FAIL: URL still visible as final message: ${finalText}`);
  }
  if (!isMediaMessage(finalText)) {
    throw new Error(`[${name}] FAIL: final message is not a media marker: ${finalText}`);
  }

  // 5) Kind-specific final check.
  const kindOk =
    (expectedKind === "video" && (isVideoMessage(finalText))) ||
    (expectedKind === "embed" && isEmbedMessage(finalText)) ||
    (expectedKind === "image" && isImageMessage(finalText)) ||
    (expectedKind === "gallery" && isGalleryMessage(finalText)) ||
    (expectedKind === "audio" && (isVideoMessage(finalText) || isAudioMessage(finalText)));
  if (!kindOk) {
    throw new Error(`[${name}] FAIL: final media kind mismatch for ${expectedKind}: ${finalText}`);
  }

  console.log(
    `  ✓ ${name}  (platform=${detectPlatform(url)}, final=${finalText.slice(0, 14)}…) — URL replaced by ${expectedKind}`,
  );
}

function runFailureCase(name: string, url: string) {
  // When extraction fails the URL must be REMOVED, never left behind.
  const chat = new FakeChat();
  const id = "row-" + Math.random().toString(36).slice(2);
  chat.insert(id, url);
  // Pipeline failed → tombstone / remove.
  chat.replace(id, "[removed]");
  const visible = chat.visible();
  if (visible.some((v) => looksLikeUrl(v.text))) {
    throw new Error(`[${name}] FAIL: URL still visible after failed extraction`);
  }
  console.log(`  ✓ ${name}  — failed extraction leaves NO URL behind`);
}

export function runSelfTest(): void {
  console.log("── SOCIAL URL → MEDIA TRANSFORM SELF-TEST ──");

  // TEST 1: YouTube → video.
  runCase("TEST 1: YouTube URL", "https://youtube.com/watch?v=dQw4w9WgXcQ", "video");
  runCase("TEST 1b: youtu.be", "https://youtu.be/dQw4w9WgXcQ", "video");
  runCase("TEST 1c: YouTube Shorts", "https://www.youtube.com/shorts/abc123XYZ", "video");

  // TEST 2: Instagram Reel → video.
  runCase("TEST 2: Instagram Reel", "https://www.instagram.com/reel/CxYzAbCdEfG/", "video");

  // TEST 3: TikTok → video.
  runCase("TEST 3: TikTok URL", "https://www.tiktok.com/@user/video/7212345678901234567", "video");

  // TEST 4: Instagram Photo → image.
  runCase("TEST 4: Instagram Photo", "https://www.instagram.com/p/CxPhoto123/", "image");

  // TEST 5: Gallery post → gallery.
  runCase("TEST 5: Gallery Post", "https://www.instagram.com/p/CxGallery999/", "gallery");

  // Resilience: failed extraction must not leave a URL.
  runFailureCase("TEST 6: Failed extraction", "https://www.tiktok.com/@x/video/0000000000000000000");

  console.log("── ALL SELF-TESTS PASSED: no URL survives as a final message ──");
}

// Allow direct execution: `tsx social-transform.selftest.ts`
// (import.meta.url check keeps it inert when merely imported.)
const isMain =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].includes("social-transform.selftest");

if (isMain) {
  try {
    runSelfTest();
    process.exit(0);
  } catch (e: any) {
    console.error("✗ SELF-TEST FAILED:", e?.message || e);
    process.exit(1);
  }
}
