import type { ReactNode } from "react";

type ProjectPageProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ProjectPage({ title, actions, children }: ProjectPageProps) {
  return (
    <main className="px-4 py-6">
      {actions ? (
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      ) : (
        <h1 className="mb-6 text-xl font-semibold text-gray-900">{title}</h1>
      )}
      {children}
    </main>
  );
}
