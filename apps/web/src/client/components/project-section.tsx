import { type ReactNode, useId } from "react";

type ProjectSectionTone = "default" | "notice" | "danger";
type ProjectSectionWidth = "readable" | "full";

type ProjectSectionProps = {
  title: string;
  tone?: ProjectSectionTone;
  width?: ProjectSectionWidth;
  children: ReactNode;
};

const TONE_CLASS: Record<ProjectSectionTone, string> = {
  default: "border-gray-200",
  notice: "border-yellow-300 bg-yellow-50",
  danger: "border-red-200 bg-red-50",
};

const TITLE_CLASS: Record<ProjectSectionTone, string> = {
  default: "text-gray-900",
  notice: "text-yellow-900",
  danger: "text-red-900",
};

const WIDTH_CLASS: Record<ProjectSectionWidth, string> = {
  readable: "max-w-3xl",
  full: "",
};

export function ProjectSection({
  title,
  tone = "default",
  width = "readable",
  children,
}: ProjectSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`mt-6 rounded-md border p-4 ${TONE_CLASS[tone]} ${WIDTH_CLASS[width]}`.trimEnd()}
    >
      <h2
        id={headingId}
        className={`text-base font-semibold ${TITLE_CLASS[tone]}`}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
