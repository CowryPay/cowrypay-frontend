"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { SetPinModal } from "./SetPinModal";

type Tab = "payment" | "security" | "notifications";

const TABS: { id: Tab; label: string }[] = [
  { id: "payment",       label: "Payment" },
  { id: "security",      label: "Security & Privacy" },
  { id: "notifications", label: "Notifications" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="p-2.5 -m-2.5 flex-shrink-0"
    >
      <span
        className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${
          checked ? "bg-cowry-green justify-end" : "bg-cowry-border justify-start"
        }`}
      >
        <span className="w-5 h-5 rounded-full bg-white shadow" />
      </span>
    </button>
  );
}

function SettingRow({ title, desc, checked, onChange }: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-cowry-border last:border-b-0">
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-cowry-muted mt-0.5">{desc}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("payment");
  const [loggingOut, setLoggingOut] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);

  const handleLogOut = async () => {
    setLoggingOut(true);
    await signOut();
    router.push("/signin");
  };

  const [aiPermissions, setAiPermissions] = useState(true);
  const [biometrics,    setBiometrics]    = useState(false);
  const [txApproval,    setTxApproval]    = useState(true);
  const [pushNotifs,  setPushNotifs]  = useState(true);
  const [promotions,  setPromotions]  = useState(true);

  return (
    <div className="absolute inset-0 z-[65] bg-cowry-dark flex flex-col">
      <div className="absolute inset-0 bg-glow-green pointer-events-none" />

      <div className="relative flex flex-col h-full w-full overflow-x-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-4 lg:px-10 py-4 border-b border-cowry-border flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Back"
            className="text-white hover:text-cowry-green transition-colors -ml-1 p-1"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-current stroke-2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-lg font-bold text-white">Settings</h2>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 px-4 lg:px-10 border-b border-cowry-border flex-shrink-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-sm font-medium py-3 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "text-white border-cowry-green"
                  : "text-cowry-muted border-transparent hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto overflow-x-hidden flex-1 px-4 lg:px-10 py-4">
          <div className="lg:max-w-2xl lg:mx-auto">
          {tab === "payment" && (
            <div>
              <p className="text-xs font-semibold text-cowry-muted uppercase tracking-widest mb-1">
                Cowry AI Permissions
              </p>
              <SettingRow
                title="Cowry AI Permissions"
                desc="Allow AI to process and structure transfer requests"
                checked={aiPermissions}
                onChange={setAiPermissions}
              />
            </div>
          )}

          {tab === "security" && (
            <div>
              <div className="flex items-center justify-between gap-4 py-4 border-b border-cowry-border">
                <div>
                  <p className="text-sm font-semibold text-white">Email</p>
                  <p className="text-xs text-cowry-muted mt-0.5">{user?.email ?? "—"}</p>
                </div>
                <button className="text-cowry-green hover:text-cowry-mint transition-colors p-1" title="Edit email">
                  <PencilIcon />
                </button>
              </div>
              <div className="flex items-center justify-between gap-4 py-4 border-b border-cowry-border">
                <div>
                  <p className="text-sm font-semibold text-white">Transaction PIN</p>
                  <p className="text-xs text-cowry-muted mt-0.5">
                    {user?.pinSet ? "PIN is set" : "Required before you can send money"}
                  </p>
                </div>
                <button
                  onClick={() => setShowSetPin(true)}
                  className="text-xs font-semibold text-cowry-green hover:text-cowry-mint transition-colors border border-cowry-green/40 hover:border-cowry-green rounded-full px-3 py-1.5"
                >
                  {user?.pinSet ? "Change" : "Set PIN"}
                </button>
              </div>
              <SettingRow
                title="Face ID / Fingerprint"
                desc="Require biometrics to open app"
                checked={biometrics}
                onChange={setBiometrics}
              />
              <SettingRow
                title="Transaction Approval"
                desc="Always ask before finalizing any payment"
                checked={txApproval}
                onChange={setTxApproval}
              />
            </div>
          )}

          {tab === "notifications" && (
            <div>
              <SettingRow
                title="Push Notifications"
                desc="Instant alerts for incoming and outgoing payments"
                checked={pushNotifs}
                onChange={setPushNotifs}
              />
              <SettingRow
                title="Promotions & Updates"
                desc="Stay up to date on Cowry news, features, and offers"
                checked={promotions}
                onChange={setPromotions}
              />
            </div>
          )}
          </div>
        </div>

        {tab === "security" && (
          <div className="flex-shrink-0 px-4 lg:px-10 pb-4">
           <div className="lg:max-w-2xl lg:mx-auto">
            <button
              onClick={handleLogOut}
              disabled={loggingOut}
              className="w-full flex items-center justify-center gap-2 bg-cowry-card border border-cowry-border rounded-2xl py-3.5 text-sm font-semibold text-white hover:border-red-400/40 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {loggingOut ? "Logging out…" : "Log Out"}
              <LogoutIcon />
            </button>
           </div>
          </div>
        )}
      </div>

      {showSetPin && (
        <SetPinModal
          email={user?.email ?? null}
          onClose={() => setShowSetPin(false)}
          onDone={() => {
            setShowSetPin(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
