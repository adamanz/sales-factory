export const metadata = { title: "Sales Factory", description: "Live call → real Salesforce quotes, decks, and coaching." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body style={{ fontFamily: "ui-sans-serif, system-ui", margin: 0 }}>{children}</body></html>);
}
