"use client";

import { useEffect } from "react";

/**
 * Updates the document title with the unread count.
 * Example: "(2) LINE Clone"
 */
export function useDocumentTitleUnread(count: number, baseTitle: string = "LINE Clone") {
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (count > 0) {
      document.title = `(${count}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // Restore title on unmount
    return () => {
      document.title = baseTitle;
    };
  }, [count, baseTitle]);
}
