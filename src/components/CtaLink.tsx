"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  className?: string;
  children: ReactNode;
}

/** Same CTA everywhere on the landing page — skips onboarding/signup straight to the chat for an already-signed-in visitor. */
export function CtaLink({ className, children }: Props) {
  const { isAuthenticated } = useAuth();
  return (
    <Link href={isAuthenticated ? "/app" : "/onboarding"} className={className}>
      {children}
    </Link>
  );
}
