export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-950/60 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-14">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-white/10" />
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="col-span-12 h-48 animate-pulse rounded-3xl bg-white/5 xl:col-span-8" />
          <div className="col-span-12 h-48 animate-pulse rounded-3xl bg-white/5 xl:col-span-4" />
        </div>
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="col-span-12 h-72 animate-pulse rounded-3xl bg-white/5 xl:col-span-7" />
          <div className="col-span-12 h-72 animate-pulse rounded-3xl bg-white/5 xl:col-span-5" />
        </div>
        <div className="h-56 animate-pulse rounded-3xl bg-white/5" />
      </div>
    </div>
  );
}
