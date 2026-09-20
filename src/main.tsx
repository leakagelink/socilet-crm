import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/App";
import { AuthProvider } from "@/hooks/useAuth";
import { ensureSeed } from "@/lib/db";
import { applyNativeChrome } from "@/lib/nativeChrome";
import "@/index.css";

const queryClient = new QueryClient();

void applyNativeChrome();
void ensureSeed().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
});
