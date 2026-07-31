"use client";

export const PIN_LENGTH = 4;

export function PinDots({ filled, error }: { filled: number; error: boolean }) {
  return (
    <div className="flex items-center justify-center gap-4 mb-10">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <span
          key={i}
          className={`w-4 h-4 rounded-full border-2 transition-all ${
            error
              ? "bg-red-500 border-red-500"
              : i < filled
                ? "bg-cowry-green border-cowry-green scale-110"
                : "border-cowry-border"
          }`}
        />
      ))}
    </div>
  );
}

function BackspaceIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
      <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" strokeLinejoin="round" />
      <path d="M15 10l-4 4M11 10l4 4" strokeLinecap="round" />
    </svg>
  );
}

const KEYPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function Keypad({ onDigit, onBackspace }: { onDigit: (d: string) => void; onBackspace: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mx-auto">
      {KEYPAD_KEYS.map((k, i) =>
        k === "" ? (
          <div key={i} />
        ) : k === "back" ? (
          <button
            key={i}
            type="button"
            onClick={onBackspace}
            aria-label="Backspace"
            className="aspect-square rounded-full flex items-center justify-center text-cowry-muted hover:text-white hover:bg-cowry-card active:scale-95 transition-all"
          >
            <BackspaceIcon />
          </button>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onDigit(k)}
            className="aspect-square rounded-full flex items-center justify-center text-xl font-semibold text-white bg-cowry-card hover:bg-cowry-border active:scale-95 transition-all"
          >
            {k}
          </button>
        ),
      )}
    </div>
  );
}
