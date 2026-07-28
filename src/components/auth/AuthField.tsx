import type { ReactNode } from "react";

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

type AuthFieldProps = {
  icon: ReactNode;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
};

export function AuthField({ icon, label, type, value, onChange, autoFocus }: AuthFieldProps) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-cowry-muted text-sm mb-2">
        {icon}
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        autoComplete={type === "email" ? "email" : "current-password"}
        className="w-full bg-cowry-card border border-cowry-border rounded-2xl px-4 py-4 text-white text-base focus:outline-none focus:border-cowry-green/50 transition-colors"
      />
    </label>
  );
}
