import "./globals.css";
import SessionProvider from "@/components/providers/SessionProvider";

export const metadata = {
  title: "StockPulse — AI Stock Recommendations",
  description: "Real-time AI-powered stock analysis and recommendations",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
