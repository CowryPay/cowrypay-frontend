"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { confirmPasswordSet } from "@/lib/backendApi";
import { getErrorMessage } from "@/lib/errors";
import { AuthField, LockIcon } from "@/components/auth/AuthField";
import { AuthButton } from "@/components/auth/AuthButton";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tooShort = password.length > 0 && password.length < 6;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = password.length >= 6 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      // Password is set directly against Supabase Auth — never sent to our backend.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await confirmPasswordSet();
      router.push("/app");
    } catch (err) {
      setError(getErrorMessage(err, "Could not set password"));
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center px-8 overflow-y-auto scrollbar-hide">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <h1 className="text-4xl font-black mb-10">Set Password</h1>

        <div className="space-y-5 mb-2">
          <AuthField
            icon={<LockIcon />}
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoFocus
            autoComplete="new-password"
          />
          <AuthField
            icon={<LockIcon />}
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />
        </div>

        {tooShort && <p className="text-amber-400 text-xs mb-2">Password must be at least 6 characters.</p>}
        {mismatch && <p className="text-red-400 text-xs mb-2">Passwords don&apos;t match.</p>}

        <div className="mt-6">
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

          <AuthButton type="submit" arrow disabled={loading || !canSubmit}>
            {loading ? "Saving…" : "Continue"}
          </AuthButton>
        </div>
      </form>
    </div>
  );
}
