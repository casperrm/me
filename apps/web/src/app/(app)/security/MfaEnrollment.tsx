"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "enrolling" | "confirmed";

export function MfaEnrollment() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [secret, setSecret] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setSecret(data.secret);
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setStep("enrolling");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setRecoveryCodes(data.recoveryCodes);
      setStep("confirmed");
    } finally {
      setLoading(false);
    }
  }

  function onDone() {
    router.refresh();
  }

  if (step === "idle") {
    return (
      <div>
        <p className="mb-3 text-sm text-neutral-500">
          Two-factor authentication is not enabled on your account (Bible Section 23.1).
        </p>
        <button
          onClick={startEnrollment}
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Starting…" : "Enable two-factor authentication"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <form onSubmit={onConfirm} className="space-y-3">
        <p className="text-sm text-neutral-600">
          Scan this QR code with your authenticator app (Google Authenticator, 1Password, Authy, etc.), or enter the
          key manually:
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCodeDataUrl} alt="MFA enrollment QR code" className="h-40 w-40 rounded-md border border-neutral-200" />
        <p className="font-mono text-xs text-neutral-500">{secret}</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">
            Enter the 6-digit code from your app to confirm
          </label>
          <input
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-40 rounded-md border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700 disabled:opacity-50"
        >
          {loading ? "Confirming…" : "Confirm and enable"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-sm font-medium text-amber-800">Save your recovery codes now — they won&apos;t be shown again.</p>
        <p className="mt-1 text-xs text-amber-700">Each code can be used once if you lose access to your authenticator app.</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {recoveryCodes.map((c) => (
          <li key={c} className="rounded bg-neutral-100 px-2 py-1">
            {c}
          </li>
        ))}
      </ul>
      <button onClick={onDone} className="rounded-md bg-cedar-600 px-4 py-2 text-sm font-medium text-white hover:bg-cedar-700">
        I&apos;ve saved these codes
      </button>
    </div>
  );
}
