import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyAction } from "@/app/actions/authActions";
import { getCurrentUser } from "@/lib/auth";

type SearchParams = Promise<{ email?: string; error?: string }> | { email?: string; error?: string } | undefined;

export default async function VerifyPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolved = searchParams instanceof Promise ? await searchParams : searchParams;
  const user = await getCurrentUser();
  if (user?.isVerified) {
    redirect("/dashboard");
  }

  const presetEmail = resolved?.email || user?.email || "";
  const error = resolved?.error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="absolute inset-0 -z-10 overflow-hidden opacity-60">
        <div className="floating-blur" />
        <div className="floating-blur delay-300 left-1/3" />
        <div className="floating-blur delay-500 left-2/3" />
      </div>
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-14">
        <div className="glass-panel rounded-3xl p-[1.5px] shadow-2xl shadow-black/40">
          <div className="rounded-[calc(1.5rem-1.5px)] bg-gradient-to-br from-white/10 to-white/0 p-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">SimpleBank</p>
                <h1 className="text-3xl font-semibold text-white">Verify your email</h1>
                <p className="mt-2 text-slate-300">Enter the 6-digit code we sent to your inbox. Codes expire in 10 minutes.</p>
              </div>
              <Link
                href="/signin"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                Back to sign in
              </Link>
            </div>
            <form action={verifyAction} className="mt-6 space-y-4">
              <label className="space-y-2 text-sm text-slate-200">
                Email
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={presetEmail}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
                  placeholder="you@example.com"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-200">
                Verification code
                <input
                  name="code"
                  required
                  minLength={4}
                  maxLength={6}
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none tracking-[0.2em]"
                  placeholder="123456"
                />
              </label>
              {error && <p className="text-sm font-semibold text-rose-200">{error}</p>}
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
              >
                Verify and continue
              </button>
              <p className="text-xs text-slate-400">Didn’t get it? Check spam or try signing in to trigger another code.</p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
