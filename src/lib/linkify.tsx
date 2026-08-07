import type { ReactNode } from "react";

const URL_RE = /(https?:\/\/\S+)/g;

/**
 * Splits chat text on bare URLs and renders them as clickable links,
 * leaving everything else as plain text. Backend messages (help text, the
 * community Telegram link, etc.) are plain strings with no markdown/HTML —
 * this is what makes a URL in them actually tappable instead of inert text.
 */
export function linkify(text: string, linkClassName: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (!/^https?:\/\/\S+$/.test(part)) return part;

    // Trailing punctuation is almost always sentence punctuation, not part of the URL.
    const trailing = part.match(/[).,!?]+$/)?.[0] ?? "";
    const url = trailing ? part.slice(0, -trailing.length) : part;

    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          {url}
        </a>
        {trailing}
      </span>
    );
  });
}
