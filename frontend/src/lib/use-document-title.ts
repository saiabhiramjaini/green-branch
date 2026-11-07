"use client";

import { useEffect } from "react";

/**
 * Set the browser tab title from a client page. Next's metadata only covers server
 * pages and re-applies the layout title after hydration, so keep ours in place.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}
