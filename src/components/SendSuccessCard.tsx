"use client";
import Image from "next/image";

type Props = {
  orderId: string;
  message: string;
};

export function SendSuccessCard({ orderId, message }: Props) {
  return (
    <div className="w-full bg-cowry-dark border border-cowry-border rounded-2xl px-5 py-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-cowry-green/15 border border-cowry-green/40 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-cowry-green">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          </span>
          <span className="text-sm font-bold text-white">Payment sent</span>
        </div>
        <span className="text-[11px] font-medium text-cowry-green bg-cowry-green/10 border border-cowry-green/40 rounded-full px-3 py-1">
          {orderId}
        </span>
      </div>

      {message && (
        <p className="text-sm text-cowry-muted leading-relaxed mb-4 whitespace-pre-wrap">{message}</p>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-cowry-border">
        <span className="text-xs text-cowry-muted">Executed by</span>
        <Image src="/CowryPay.png" alt="CowryPay" width={110} height={21} className="object-contain" />
      </div>
    </div>
  );
}
