/**
 * ════════════════════════════════════════════════════════════════
 *  DISCORD FILE UPLOAD — cloud storage via Discord webhook
 *  ════════════════════════════════════════════════════════════════
 *  Upload files (images/videos) to Discord via a webhook URL,
 *  which stores them on Discord's CDN and returns a shareable URL.
 *
 *  SETUP:
 *  1. Create a Discord server
 *  2. Create a text channel
 *  3. Create a webhook in that channel
 *  4. Store the webhook URL in process.env.DISCORD_WEBHOOK_URL
 *
 *  The webhook URL looks like:
 *  https://discord.com/api/webhooks/{id}/{token}
 * ════════════════════════════════════════════════════════════════
 */

export async function uploadToDiscord(file: File): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const webhookUrl = process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      return { success: false, error: 'Discord webhook URL not configured' };
    }

    // Create FormData with the file
    const formData = new FormData();
    formData.append('file', file);

    // Upload to Discord webhook
    const res = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      return { success: false, error: `Discord upload failed: ${res.status}` };
    }

    const data = await res.json();
    // Discord webhook response includes attachments array with the uploaded file
    if (data.attachments && data.attachments.length > 0) {
      const attachment = data.attachments[0];
      return { success: true, url: attachment.url };
    }

    return { success: false, error: 'No attachment returned from Discord' };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Upload an image file to Discord and return the CDN URL.
 */
export async function uploadImageToDiscord(file: File): Promise<{ success: boolean; url?: string }> {
  const result = await uploadToDiscord(file);
  if (result.success && result.url) {
    return { success: true, url: result.url };
  }
  console.warn('Discord image upload failed:', result.error);
  return { success: false };
}

/**
 * Upload a video file to Discord and return the CDN URL.
 */
export async function uploadVideoToDiscord(file: File): Promise<{ success: boolean; url?: string }> {
  const result = await uploadToDiscord(file);
  if (result.success && result.url) {
    return { success: true, url: result.url };
  }
  console.warn('Discord video upload failed:', result.error);
  return { success: false };
}
