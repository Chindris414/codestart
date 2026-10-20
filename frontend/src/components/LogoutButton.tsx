"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { postJson } from "@/lib/auth";

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await postJson("/api/auth/logout");
    setLoading(false);
    router.refresh(); // re-render the page as a logged-out visitor
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded border px-3 py-1 text-sm disabled:opacity-50"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}