"use client";

// Decides whether to show the app chrome (sidebar + top bar). The login page is
// a standalone full-screen view, so we render just its content there; every
// other route gets the normal workspace layout.
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";
import TopBar from "./topbar";

export default function Chrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  // The dashboard is a full-bleed, self-titled view (its own date + greeting
  // header), so it skips the breadcrumb top bar that the other routes show.
  const showTopBar = pathname !== "/overview";

  return (
    <>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {showTopBar && <TopBar />}
        {children}
      </div>
    </>
  );
}
