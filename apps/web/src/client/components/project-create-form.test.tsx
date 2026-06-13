import { fireEvent, render, screen } from "@testing-library/react";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectCreateForm } from "./project-create-form";

describe("ProjectCreateForm", () => {
  it("renders field-level validation error beneath the input", () => {
    render(
      <ProjectCreateForm
        name="Alpha"
        fieldErrors={{ name: "Name is required" }}
        requestError={null}
        isSubmitting={false}
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-describedby",
      "projectName-error",
    );
  });

  it("renders request error separately from field errors", () => {
    render(
      <ProjectCreateForm
        name=""
        fieldErrors={{}}
        requestError="Request failed"
        isSubmitting={false}
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Request failed");
    expect(screen.getByLabelText("プロジェクト名")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("renders both field error and request error simultaneously", () => {
    render(
      <ProjectCreateForm
        name="Alpha"
        fieldErrors={{ name: "Name is required" }}
        requestError="Request failed"
        isSubmitting={false}
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Request failed")).toBeInTheDocument();
  });

  it("applies error border style when field has error", () => {
    render(
      <ProjectCreateForm
        name=""
        fieldErrors={{ name: "Name is required" }}
        requestError={null}
        isSubmitting={false}
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("プロジェクト名");
    expect(input.className).toContain("border-red-500");
  });

  it("does not apply error border when no field error", () => {
    render(
      <ProjectCreateForm
        name=""
        fieldErrors={{}}
        requestError={null}
        isSubmitting={false}
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("プロジェクト名");
    expect(input.className).toContain("border-gray-300");
    expect(input.className).not.toContain("border-red-500");
  });

  it("calls handlers on input change and submit", () => {
    const onNameChange = vi.fn();
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) =>
      event.preventDefault(),
    );

    render(
      <ProjectCreateForm
        name=""
        fieldErrors={{}}
        requestError={null}
        isSubmitting={false}
        onNameChange={onNameChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("プロジェクト名"), {
      target: { value: "Beta" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "プロジェクトを作成" }),
    );

    expect(onNameChange).toHaveBeenCalledWith("Beta");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows submitting label and disabled state", () => {
    render(
      <ProjectCreateForm
        name="Alpha"
        fieldErrors={{}}
        requestError={null}
        isSubmitting
        onNameChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "作成中..." })).toBeDisabled();
    expect(screen.getByLabelText("プロジェクト名")).toBeDisabled();
    expect(screen.getByRole("button", { name: "作成中..." })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
