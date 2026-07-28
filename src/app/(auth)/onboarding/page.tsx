"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthButton } from "@/components/auth/AuthButton";

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-cowry-darker">
      <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11h-2z" />
    </svg>
  );
}

/** Hero image with a floating voice-transcript chip — sits directly on the
 *  page background, no card panel (the chat bubbles are baked into image.jpeg). */
function VoiceHero() {
  return (
    <div className="relative w-72 h-80">
      <Image src="/image.jpeg" alt="" fill className="object-contain object-bottom" />
      <div className="absolute left-2 bottom-4 flex items-center gap-2 bg-cowry-dark/80 border border-cowry-green/30 backdrop-blur-sm rounded-full pl-1.5 pr-4 py-1.5 max-w-[85%]">
        <span className="w-7 h-7 rounded-full bg-cowry-green flex items-center justify-center flex-shrink-0">
          <MicIcon />
        </span>
        <span className="text-xs text-white/90 italic truncate">&quot;Send $50 to bank account…&quot;</span>
      </div>
    </div>
  );
}

function AfricaHero() {
  return (
    <div className="relative w-72 h-72">
      <Image src="/map.png" alt="" fill className="object-contain" />
    </div>
  );
}

function LockIllustration() {
  return (
    <div className="relative w-64 h-64">
      <Image src="/Padlock.png" alt="" fill className="object-contain" />
    </div>
  );
}

type Slide = {
  title: string;
  desc: string;
  visual: "voice" | "africa" | "lock";
};

const SLIDES: Slide[] = [
  {
    title: "Send money as easily as typing a message",
    desc: "Simply type or use your voice to tell CowryPay what to send and where.",
    visual: "voice",
  },
  {
    title: "Crypto straight to local bank accounts",
    desc: "Convert USDC directly to local currency in bank accounts or mobile wallets across Africa.",
    visual: "africa",
  },
  {
    title: "Low fees, multi-chain power, total safety",
    desc: "No transaction ever executes without your explicit approval.",
    visual: "lock",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const slide = SLIDES[active];
  const isLast = active === SLIDES.length - 1;

  const next = () => {
    if (isLast) {
      router.push("/signup");
      return;
    }
    setActive((i) => i + 1);
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col px-6 py-3 overflow-y-auto scrollbar-hide">
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      <div className="flex justify-end mb-3">
        <Link href="/signin" className="text-sm font-semibold text-cowry-green">
          Skip
        </Link>
      </div>

      <div className="text-center space-y-2 mb-3 px-2">
        <h1 className="text-2xl font-black leading-tight">{slide.title}</h1>
        <p className="text-cowry-muted text-sm leading-relaxed">{slide.desc}</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between bg-[#1B1B1B] border border-[#263B25] rounded-2xl py-4">
        <div />
        {slide.visual === "lock" ? (
          <LockIllustration />
        ) : slide.visual === "africa" ? (
          <AfricaHero />
        ) : (
          <VoiceHero />
        )}

        <div className="flex items-center justify-center">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setActive(i)}
              className="p-2.5 flex items-center justify-center"
            >
              <span className={`h-1.5 rounded-full transition-all ${i === active ? "w-6 bg-cowry-green" : "w-1.5 bg-cowry-border"}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2">
        <AuthButton onClick={next} arrow>
          {isLast ? "Get Started" : "Continue"}
        </AuthButton>
        <p className="text-center text-cowry-muted text-sm mt-2">
          Already have an account?{" "}
          <Link href="/signin" className="text-cowry-green">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
