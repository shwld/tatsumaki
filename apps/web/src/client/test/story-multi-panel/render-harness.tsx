import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

import { AuthErrorProvider } from "../../contexts/auth-error-context";
import { ToastProvider } from "../../contexts/toast-context";
import { StoryMultiPanelScreen } from "../../screens/story-multi-panel-screen";
import { PROJECT_ID } from "./fixtures";

export function renderStoryMultiPanel(
  initialEntry = `/projects/${PROJECT_ID}/stories`,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthErrorProvider>
          <ToastProvider>
            <Routes>
              <Route
                path="/projects/:projectId/stories"
                element={<StoryMultiPanelScreen />}
              />
            </Routes>
          </ToastProvider>
        </AuthErrorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
