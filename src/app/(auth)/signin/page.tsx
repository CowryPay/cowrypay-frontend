"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthField, MailIcon, LockIcon } from "@/components/auth/AuthField";
import { AuthButton } from "@/components/auth/AuthButton";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep("password");
  };

  // BlockRadar auth isn't wired up yet — stub straight into the app.
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/app");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center px-8 overflow-y-auto scrollbar-hide">
      {step === "email" ? (
        <form onSubmit={handleEmailSubmit} className="flex flex-col">
          <h1 className="text-4xl font-black mb-10">Sign in</h1>

          <div className="mb-8">
            <AuthField icon={<MailIcon />} label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          </div>

          <AuthButton type="submit">Log In</AuthButton>

          <p className="text-center text-cowry-muted text-sm mt-4">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-cowry-green">
              Sign Up
            </Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col">
          <h1 className="text-4xl font-black mb-10">Sign in</h1>

          <div className="mb-8">
            <AuthField icon={<LockIcon />} label="Password" type="password" value={password} onChange={setPassword} autoFocus />
          </div>

          <AuthButton type="submit" arrow>
            Continue
          </AuthButton>

          <p className="text-center text-cowry-muted text-sm mt-4">Forgot Password?</p>
        </form>
      )}
    </div>
  );
}
