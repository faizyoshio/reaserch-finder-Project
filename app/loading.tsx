export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 sm:p-10 w-full max-w-md text-center animate-glass-in">
        <div className="relative mx-auto mb-6 w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
          <div className="absolute inset-3 rounded-full bg-emerald-500/10 animate-pulse" />
        </div>

        <h2 className="text-xl sm:text-2xl font-semibold mb-2">Preparing ResearchAtlas</h2>
        <p className="text-sm sm:text-base text-foreground/65">Loading discovery interface and source indexes...</p>

        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-emerald-500/70 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-emerald-500/70 animate-pulse [animation-delay:120ms]" />
          <span className="w-2 h-2 rounded-full bg-emerald-500/70 animate-pulse [animation-delay:240ms]" />
        </div>
      </div>
    </div>
  )
}
