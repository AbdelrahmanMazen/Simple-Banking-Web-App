import Link from "next/link";
import { redirect } from "next/navigation";
import { signinAction, signoutAction } from "@/app/actions/authActions";
import { getCurrentUser } from "@/lib/auth";

export default async function SigninPage() {
  const user = await getCurrentUser();
    if (user?.isVerified) redirect("/dashboard");

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
                <h1 className="text-3xl font-semibold text-white">Sign in</h1>
                <p className="mt-2 text-slate-300">Access your accounts, transactions, and admin dashboard.</p>
              </div>
              <Link
                href="/signup"
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                Need an account?
              </Link>
            </div>
            {user && !user.isVerified ? (
              <div className="mt-6 space-y-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-semibold">You are signed in as {user.email}, but the email is not verified.</p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/verify?email=${encodeURIComponent(user.email)}`}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                  >
                    Go to verification
                  </Link>
                  <form action={signoutAction}>
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:bg-white/20"
                    >
                      Sign out to switch account
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <form action={signinAction} className="mt-6 space-y-4">
                <label className="space-y-2 text-sm text-slate-200">
                  Email
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="you@example.com"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-200">
                  Password
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 transition hover:-translate-y-0.5 hover:bg-emerald-400"
                >
                  Continue
                </button>
                <p className="text-xs text-slate-400">The first account created will be made admin by default.</p>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
