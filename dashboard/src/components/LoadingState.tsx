export function LoadingState({
  message = "Lots of cash loading here, please be patient.",
}: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="h-10 w-10 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-teal-500 animate-spin" />
      <p className="text-gray-500 text-sm">{message}</p>
      <div className="w-48 h-1 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
        <div className="h-full w-1/3 bg-teal-500 rounded animate-loading-bar" />
      </div>
    </div>
  );
}
