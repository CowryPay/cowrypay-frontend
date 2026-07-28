import type { Viewport } from "next";

export const viewport: Viewport = {
  maximumScale: 1,
  userScalable: false,
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="h-full flex flex-col w-full max-w-md mx-auto bg-cowry-dark"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      {children}
    </div>
  );
}
