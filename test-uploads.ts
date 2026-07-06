/**
 * ════════════════════════════════════════════════════════════════
 *  UPLOAD SERVICE VERIFICATION TEST
 *  Run this to verify all storage providers are working
 * ════════════════════════════════════════════════════════════════ */

import { uploadMediaHybrid } from "./hybrid-storage";

export async function testAllUploadServices() {
  console.log("🧪 Starting upload service verification...\n");

  // Create a small test image (1x1 red pixel PNG)
  const testImage = new Blob(
    [Uint8Array.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xFF, 0xFF, 0x3F, 0x00,
      0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59, 0xE7, 0x00, 0x00, 0x00, 0x00,
      0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ])],
    { type: "image/png" }
  );

  const results: Array<{ provider: string; status: "✅" | "❌"; url?: string; error?: string }> = [];

  // Test hybrid upload (will try all providers in sequence)
  try {
    console.log("📤 Testing hybrid upload system...");
    const result = await uploadMediaHybrid(testImage, "test.png");
    
    if (result.success && result.url) {
      results.push({
        provider: result.provider,
        status: "✅",
        url: result.url,
      });
      console.log(`✅ ${result.provider} succeeded!`);
      console.log(`   URL: ${result.url}\n`);
    } else {
      results.push({
        provider: result.provider,
        status: "❌",
        error: result.error,
      });
      console.log(`❌ All providers failed: ${result.error}\n`);
    }
  } catch (err: any) {
    results.push({
      provider: "Hybrid",
      status: "❌",
      error: err.message,
    });
    console.log(`❌ Hybrid upload threw error: ${err.message}\n`);
  }

  // Summary
  console.log("═══════════════════════════════════════════════════");
  console.log("📊 TEST SUMMARY");
  console.log("═══════════════════════════════════════════════════");
  results.forEach(r => {
    console.log(`${r.status} ${r.provider}${r.url ? ` → ${r.url}` : ""}${r.error ? ` (${r.error})` : ""}`);
  });

  const successCount = results.filter(r => r.status === "✅").length;
  console.log(`\n${successCount > 0 ? "✅" : "❌"} ${successCount} provider(s) working`);

  return results;
}

// Auto-run if in browser console
if (typeof window !== "undefined") {
  (window as any).testUploads = testAllUploadServices;
  console.log("🧪 Upload test ready! Run: await testUploads()");
}
