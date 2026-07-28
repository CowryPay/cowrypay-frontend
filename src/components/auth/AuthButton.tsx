import type { ButtonHTMLAttributes } from "react";

type AuthButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  arrow?: boolean;
};

export function AuthButton({ children, arrow, className = "", ...props }: AuthButtonProps) {
  return (
    <button
      className={`w-full bg-gradient-to-r from-[#5CFF7E] to-cowry-green text-white font-bold py-4 rounded-full text-base flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
      {arrow && <span aria-hidden>→</span>}
    </button>
  );
}
