import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useProjectName } from "../contexts/project-name-context";

export function PageTitle({
  titleKey,
  children,
}: {
  titleKey: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { name } = useProjectName();
  const prefix = name || t("app.name");
  const title = `${prefix} | ${t(titleKey)}`;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return children;
}
