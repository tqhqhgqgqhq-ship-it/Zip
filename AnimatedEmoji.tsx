import { memo, useState } from "react";
import { getAnimation } from "../lib/emoji-animations";

interface Props {
  emoji: string;
  size?: number;
  className?: string;
}

/**
 * Renders an animated emoji (GIF) if available,
 * otherwise falls back to static emoji character.
 */
export const AnimatedEmoji = memo(function AnimatedEmoji({
  emoji,
  size = 48,
  className = "",
}: Props) {
  const anim = getAnimation(emoji);
  const [error, setError] = useState(false);

  // If no animation exists, just render static emoji
  if (!anim) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
      >
        {emoji}
      </span>
    );
  }

  // If animation failed to load, fall back to static emoji
  if (error) {
    return (
      <span
        className={className}
        style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
      >
        {anim.fallback}
      </span>
    );
  }

  return (
    <img
      src={anim.animationUrl.replace('.json', '.gif')}
      alt={anim.name}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
      }}
      onError={() => setError(true)}
    />
  );
});

/**
 * Renders text with animated emoji inline.
 * Scans text for emoji characters and replaces them with AnimatedEmoji components.
 */
export const AnimatedText = memo(function AnimatedText({
  text,
  emojiSize = 32,
  className = "",
}: {
  text: string;
  emojiSize?: number;
  className?: string;
}) {
  // Simple approach: split by emoji and render mixed content
  const emojiRegex = /[\p{Emoji_Presentation}]/gu;
  const parts = text.split(emojiRegex);
  const emoji = text.match(emojiRegex) || [];

  if (emoji.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const elements: React.ReactNode[] = [];
  let emojiIdx = 0;

  parts.forEach((part, i) => {
    if (part) {
      elements.push(
        <span key={`text-${i}`} className={className}>
          {part}
        </span>
      );
    }
    if (emoji[emojiIdx]) {
      elements.push(
        <AnimatedEmoji
          key={`emoji-${i}`}
          emoji={emoji[emojiIdx]}
          size={emojiSize}
        />
      );
      emojiIdx++;
    }
  });

  return <>{elements}</>;
});
