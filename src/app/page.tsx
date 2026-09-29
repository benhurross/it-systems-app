import Image from "next/image";

export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar p-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <Image src="/brand/applus-white.svg" alt="AP Plus" width={258} height={80} priority />
        <h1 className="text-2xl font-semibold text-sidebar-foreground">AP Plus IT Systems</h1>
      </div>
    </main>
  );
}
