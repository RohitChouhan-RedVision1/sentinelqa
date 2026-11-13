import "./globals.css";

export const metadata = {
  title: "Sentinel QA — AI website quality control",
  description: "Safe, evidence-led website testing for product teams."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
