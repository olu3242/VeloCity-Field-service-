export default function AdminPortalLoading() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-7 w-40 bg-white/10 rounded animate-pulse" />
          <div className="flex gap-4">
            {[0,1,2,3].map(i => <div key={i} className="h-6 w-16 bg-white/10 rounded animate-pulse" />)}
          </div>
        </div>
        <div className="h-8 w-8 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-6">
              <div className="h-9 w-16 bg-white/10 rounded animate-pulse mb-2" />
              <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[0,1].map(i => (
            <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-6">
              <div className="h-6 w-32 bg-white/10 rounded animate-pulse mb-4" />
              {[0,1,2,3].map(j => (
                <div key={j} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-white/10 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
