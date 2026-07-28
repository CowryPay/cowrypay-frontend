"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthField, MailIcon, LockIcon } from "@/components/auth/AuthField";
import { AuthButton } from "@/components/auth/AuthButton";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // BlockRadar auth isn't wired up yet — stub straight into the app.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/app");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center px-8 overflow-y-auto scrollbar-hide">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <h1 className="text-4xl font-black mb-10">Sign up</h1>

        <div className="space-y-5 mb-8">
          <AuthField icon={<MailIcon />} label="Email" type="email" value={email} onChange={setEmail} autoFocus />
          <AuthField icon={<LockIcon />} label="Password" type="password" value={password} onChange={setPassword} />
        </div>

        <AuthButton type="submit">Sign Up</AuthButton>

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
