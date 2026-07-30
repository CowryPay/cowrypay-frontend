"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";
import { AuthField, MailIcon } from "@/components/auth/AuthField";
import { AuthButton } from "@/components/auth/AuthButton";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email });
      if (otpError) throw otpError;
      router.push(`/verify?email=${encodeURIComponent(email)}&flow=signup`);
    } catch (err) {
      setError(getErrorMessage(err, "Could not send verification code"));
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center px-8 overflow-y-auto scrollbar-hide">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <h1 className="text-4xl font-black mb-10">Sign up</h1>

        <div className="space-y-5 mb-8">
          <AuthField icon={<MailIcon />} label="Email" type="email" value={email} onChange={setEmail} autoFocus />
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <AuthButton type="submit" disabled={loading || !email}>
          {loading ? "Sending code…" : "Sign Up"}
        </AuthButton>

        <p className="text-center text-cowry-muted text-sm mt-4">
          Already have an account?{" "}
          <Link href="/signin" className="text-cowry-green">
            Log In
          </Link>
        </p>
      </form>
    </div>
  );
}
