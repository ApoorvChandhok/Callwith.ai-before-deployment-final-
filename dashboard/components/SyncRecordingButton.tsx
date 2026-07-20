"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncVobizRecordingAction } from "@/lib/actions";

export default function SyncRecordingButton({ 
  logId, 
  phone, 
  timestamp 
}: { 
  logId: string; 
  phone: string; 
  timestamp: string; 
}) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  const handleSync = async () => {
    setIsPending(true);
    setMessage("");
    try {
      const result = await syncVobizRecordingAction(logId, phone, timestamp);
      setMessage(result.message);
      if (result.success) {
        // Automatically revalidates via server action
        setTimeout(() => {
          setMessage(""); // Clear message after a while
        }, 3000);
      }
    } catch (e: any) {
      setMessage("Error syncing: " + e.message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col items-center">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? "Searching Vobiz..." : "Try finding recording in Vobiz"}
      </button>
      {message && (
        <p className={`text-[10px] mt-2 ${message.includes('success') ? 'text-green-500' : 'text-red-500'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
