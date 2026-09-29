import Link from "next/link";

// Requests outside the locale routes never reach a layout, so this page carries its own document.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem", textAlign: "center" }}>
        <h1>Page not found</h1>
        <p>
          <Link href="/">AP Plus IT Systems</Link>
        </p>
      </body>
    </html>
  );
}
