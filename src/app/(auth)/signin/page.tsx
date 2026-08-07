"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";
import { AuthField, MailIcon, LockIcon } from "@/components/auth/AuthField";
import { AuthButton } from "@/components/auth/AuthButton";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push("/app");
    } catch (err) {
      setError(getErrorMessage(err, "Could not sign in"));
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email || resetting) return;
    setError("");
    setResetting(true);
    try {
      // shouldCreateUser: false — signInWithOtp defaults to silently creating
      // a brand-new account for any email that doesn't exist yet, which is
      // exactly wrong for "forgot password": without this, requesting a
      // reset code for a made-up email quietly creates a ghost Supabase user
      // instead of telling the person there's no account to reset.
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;
      router.push(`/verify?email=${encodeURIComponent(email)}&flow=reset`);
    } catch (err) {
      const message =
        err && typeof err === "object" && (err as { code?: string }).code === "otp_disabled"
          ? "No account found with that email."
          : getErrorMessage(err, "Could not send reset code");
      setError(message);
      setResetting(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center px-8 overflow-y-auto scrollbar-hide">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <h1 className="text-4xl font-black mb-10">Sign in</h1>

        <div className="space-y-5 mb-8">
          <AuthField icon={<MailIcon />} label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          <AuthField icon={<LockIcon />} label="Password" type="password" value={password} onChange={setPassword} />
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <AuthButton type="submit" arrow disabled={loading || !email || !password}>
          {loading ? "Signing in…" : "Log In"}
        </AuthButton>

        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetting}
          className="text-center text-cowry-muted text-sm mt-4 hover:text-white transition-colors disabled:opacity-50"
        >
          {resetting ? "Sending code…" : "Forgot Password?"}
        </button>

        <p className="text-center text-cowry-muted text-sm mt-4">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-cowry-green">
            Sign Up
          </Link>
        </p>
      </form>
    </div>
  );
}
