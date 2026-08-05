import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/InstallPrompt";

export const metadata: Metadata = {
  title:       "CowryPay — Talk. Send. Automate.",
  description: "AI-powered crypto payments on Celo. Send money as easily as sending a message.",
  manifest:    "/manifest.json",
  appleWebApp: {
    capable:       true,
    statusBarStyle: "black-translucent",
    title:         "CowryPay",
  },
  icons: {
    icon:     [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple:    [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title:       "CowryPay — Talk. Send. Automate.",
    description: "AI-powered conversational crypto payments on Celo.",
    images:      [{ url: "/icon-512.png" }],
  },
};

export const viewport: Viewport = {
  width:            "device-width",
  initialScale:     1,
  maximumScale:     1,
  userScalable:     false,   // prevent accidental pinch-zoom
  viewportFit:      "cover", // respect notch / safe-area on all phones
  themeColor:       "#0A0F1E",
  colorScheme:      "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full overflow-hidden bg-cowry-dark font-sans antialiased">
        <ServiceWorkerRegister />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
