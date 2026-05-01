"use client";

import { useEffect } from "react";

/**
 * Handles mobile virtual keyboard open/close via the Visual Viewport API.
 * When the keyboard opens (viewport shrinks), calls the provided callback
 * so the chat can adjust scroll position or layout.
 *
 * Falls back gracefully on browsers without visualViewport support.
 */
export function useVisualViewportResize(onResize?: () => void) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !onResize) return;

    let prevHeight = vv.height;

    const handleResize = () => {
      const currentHeight = vv.height;
      // Keyboard opened (viewport got smaller) or closed (viewport got bigger)
      if (currentHeight !== prevHeight) {
        prevHeight = currentHeight;
        // Small delay to let the browser finish layout
        requestAnimationFrame(() => {
          onResize();
        });
      }
    };

    vv.addEventListener("resize", handleResize);
    return () => vv.removeEventListener("resize", handleResize);
  }, [onResize]);
}
