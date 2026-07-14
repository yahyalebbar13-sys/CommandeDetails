"use client";

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an external service
    console.error("CATEGORY ERROR BOUNDARY CAUGHT ERROR:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-red-50">
      <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong in Category!</h2>
      <pre className="bg-white p-4 rounded text-left text-sm max-w-full overflow-auto text-red-800 border border-red-200">
        {error.name}: {error.message}
        {"\n\n"}
        {error.stack}
      </pre>
      <button
        className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
