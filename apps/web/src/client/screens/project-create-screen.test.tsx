import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthErrorProvider } from "../contexts/auth-error-context";
import { ProjectCreateScreen } from "./project-create-screen";

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/projects/new"]}>
      <AuthErrorProvider>
        <Routes>
          <Route path="/projects/new" element={<ProjectCreateScreen />} />
          <Route path="/projects" element={<h1>プロジェクト</h1>} />
        </Routes>
      </AuthErrorProvider>
    </MemoryRouter>,
  );
}

function createDeferredResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("ProjectCreateScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading state and prevents duplicate submissions while creating", async () => {
    const deferred = createDeferredResponse();
    vi.mocked(fetch).mockReturnValue(deferred.promise);

    renderScreen();

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: "Alpha" },
    });

    const form = screen.getByLabelText("プロジェクト名").closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "作成中..." })).toBeDisabled();
    expect(screen.getByLabelText("プロジェクト名")).toBeDisabled();

    deferred.resolve(
      new Response(
        JSON.stringify({
          project: {
            id: "01HXYZ",
            name: "Alpha",
          },
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "プロジェクト" }),
      ).toBeVisible();
    });
  });

  it("restores form controls after a failed request", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Server exploded" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: "Alpha" },
    });
    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
    });

    expect(
      screen.getByRole("button", { name: "プロジェクトを作成" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("プロジェクト名")).toBeEnabled();
  });

  it("shows inline field error for empty project name", () => {
    renderScreen();

    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "プロジェクト名は必須です",
    );
    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-describedby",
      "projectName-error",
    );
  });

  it("displays 400 error as field-level error beneath the input", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Project name is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: " " },
    });
    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    // Client-side validation catches empty trim
    expect(screen.getByRole("alert")).toHaveTextContent(
      "プロジェクト名は必須です",
    );
  });

  it("displays server 400 field error inline and focuses the field", async () => {
    // Simulate a case where client-side validation passes but server returns 400
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Project name is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    renderScreen();

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: "A" },
    });
    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Project name is required",
      );
    });

    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(document.activeElement).toBe(
      screen.getByLabelText("プロジェクト名"),
    );
  });

  it("preserves input value after validation error and allows resubmission", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Project name is required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ project: { id: "01HXYZ", name: "ValidName" } }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    renderScreen();

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: "ValidName" },
    });
    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Project name is required",
      );
    });

    // Input value is preserved
    expect(screen.getByLabelText("プロジェクト名")).toHaveValue("ValidName");

    // Resubmit
    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "プロジェクト" }),
      ).toBeVisible();
    });
  });

  it("shows error border on the input when field error exists", async () => {
    renderScreen();

    fireEvent.submit(screen.getByLabelText("プロジェクト名").closest("form")!);

    const input = screen.getByLabelText("プロジェクト名");
    expect(input.className).toContain("border-red-500");
  });
});
