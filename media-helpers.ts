/**
 * Media helpers — replaces old jscord-upload encode/decode.
 * Now images are stored as [img]<url>, videos as [video]<url>, voice as [voice]<url>
 */

const IMG_MARKER = '[img]';
const VID_MARKER = '[video]';
const VOICE_MARKER = '[voice]';

export function isImageMessage(text: string): boolean {
  return typeof text === 'string' && text.startsWith(IMG_MARKER);
}

export function isVideoMessage(text: string): boolean {
  return typeof text === 'string' && text.startsWith(VID_MARKER);
}

export function isVoiceMessage(text: string): boolean {
  return typeof text === 'string' && text.startsWith(VOICE_MARKER);
}

export function encodeImageMessage(url: string, _provider?: string): string {
  return `${IMG_MARKER}${url}`;
}

export function decodeImageMessage(text: string): string {
  if (isImageMessage(text)) return text.slice(IMG_MARKER.length);
  if (isVideoMessage(text)) return text.slice(VID_MARKER.length);
  if (isVoiceMessage(text)) return text.slice(VOICE_MARKER.length);
  return text;
}
