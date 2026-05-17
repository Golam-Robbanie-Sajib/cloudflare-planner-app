"use client";

import { useEffect } from "react";

// global-error.tsx is Next's last-resort boundary — it runs when even the root
// layout has crashed, so it needs to render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Root boundary error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Application error</h1>
        <p style={{ color: "#475569", marginBottom: "1rem" }}>{error.message || "Something went wrong."}</p>
        <button
          onClick={reset}
          style={{ background: "#7c3aed", color: "white", padding: "0.5rem 1rem", border: 0, borderRadius: "0.375rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
