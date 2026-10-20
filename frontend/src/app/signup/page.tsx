"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { postJson } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setFieldErrors({});
    setError("");

    const res = await postJson("/api/auth/signup", { name, email, password });
    setLoading(false);

    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    if (res.data.errors) setFieldErrors(res.data.errors);
    else setError(res.data.error ?? "Something went wrong. Please try again.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-lg border p-6">
        <h1 className="text-2xl font-bold">Create your account</h1>

        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="mt-1 w-full rounded border px-3 py-2"
          />
          {fieldErrors.email?.map((m) => (
            <span key={m} className="mt-1 block text-sm text-red-600">{m}</span>
          ))}
        </label>

        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-1 w-full rounded border px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">
            At least 8 characters, not too common, not only numbers.
          </span>
          {fieldErrors.password?.map((m) => (
            <span key={m} className="mt-1 block text-sm text-red-600">{m}</span>
          ))}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>

        <p className="text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="underline">Log in</Link>
        </p>
      </form>
    </main>
  );
}