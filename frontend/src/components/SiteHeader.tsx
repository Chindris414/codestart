import Link from "next/link";
import { Suspense } from "react";

import LogoutButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/currentUser";

async function AccountBox() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="flex gap-3">
        <Link href="/login" className="rounded border px-3 py-1 text-sm">Log in</Link>
        <Link href="/signup" className="rounded bg-blue-600 px-3 py-1 text-sm text-white">Sign up</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
        My learning
      </Link>
      <span>
        Signed in as <strong>{user.name || user.email}</strong>
      </span>
      <LogoutButton />
    </div>
  );
}

export default function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <nav className="flex items-center gap-6">
        <Link href="/" className="font-bold">CodeStart</Link>
        <Link href="/tracks" className="text-sm text-gray-600 hover:text-gray-900">Tracks</Link>
      </nav>
      <Suspense fallback={<span className="text-sm text-gray-500">…</span>}>
        <AccountBox />
      </Suspense>
    </header>
  );
}
