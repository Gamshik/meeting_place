export function FullPageLoader({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-stone-700">
      <div className="flex items-center gap-3" role="status">
        <span className="size-3 animate-pulse rounded-full bg-emerald-700" />
        <span>{label}</span>
      </div>
    </main>
  )
}
