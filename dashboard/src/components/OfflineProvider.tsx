"use client";

import { useEffect, useState } from "react";

/**
 * Registers the offline service worker and shows a banner when the
 * connection is lost (pages keep working from the local cache).
 */
export function OfflineProvider() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-amber-500 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
      Offline — showing locally saved data
    </div>
  );
}
