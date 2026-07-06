"use client";

import { useEffect, useState } from "react";
import App from "@/nudgel/App";
import { initTheme } from "@/nudgel/lib/theme";

export default function NudgelClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Apply the saved (or default Gold Luxe) theme before first client paint.
    initTheme();
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#D4A853] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <App />;
}
