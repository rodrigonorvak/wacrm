"use client";

import { Toaster } from "sonner";

/** Toaster stays aligned with the CRM's fixed light surface theme. */
export function ThemedToaster() {
  return (
    <Toaster
      theme="light"
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--popover)",
          border: "1px solid var(--border)",
          color: "var(--popover-foreground)",
        },
      }}
    />
  );
}
