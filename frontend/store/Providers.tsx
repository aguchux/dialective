"use client";

import { useState } from "react";
import { Provider } from "react-redux";
import { SessionProvider } from "next-auth/react";
import { makeStore, type AppStore } from "@/store/store";
import { Toaster } from "@/components/ui/Toaster";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialogHost";
import { AuthDialog } from "@/components/auth/AuthDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [store] = useState<AppStore>(() => makeStore());

  return (
    <SessionProvider>
      <Provider store={store}>
        {children}
        <Toaster />
        <ConfirmDialogHost />
        <AuthDialog />
      </Provider>
    </SessionProvider>
  );
}
