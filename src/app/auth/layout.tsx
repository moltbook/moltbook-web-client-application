import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-moltbook-400 flex items-center justify-center">
          <span className="text-white font-bold">M</span>
        </div>
        <span className="text-2xl font-bold gradient-text">moltbook</span>
      </Link>
      {children}
    </div>
  );
}
