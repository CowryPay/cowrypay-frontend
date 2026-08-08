"use client";
import { useEffect, useState } from "react";

type Props = {
  value: string;
  size?: number;
};

export function QrCode({ value, size = 160 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    import("qrcode")
      .then((QRCode) =>
        QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: "#000000", light: "#FFFFFF" } }),
      )
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        // Best-effort — the copy button next to the address is the fallback if QR generation fails.
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      className="mx-auto bg-white rounded-2xl p-3 flex items-center justify-center flex-shrink-0"
      style={{ width: size + 24, height: size + 24 }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- runtime-generated data URL, next/image doesn't support this
        <img src={dataUrl} alt="Deposit address QR code" width={size} height={size} />
      ) : (
        <div className="animate-pulse bg-gray-200 rounded-lg" style={{ width: size, height: size }} />
      )}
    </div>
  );
}
