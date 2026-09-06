"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-6 text-sm text-red-800">
      <p className="mb-3 font-medium">Something went wrong: {error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  );
}
