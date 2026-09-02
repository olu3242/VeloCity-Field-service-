export default function CustomerDashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-9 w-28 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {[0,1,2].map(i => (
            <div key={i} className="bg-white rounded-lg border p-6">
              <div className="h-9 w-16 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-white rounded-lg border p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse" />
                <div>
                  <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-2" />
                  <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
