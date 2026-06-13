import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { errorRetryEn, errorRetryJa } from "../components/error-retry.i18n";
import { layoutEn, layoutJa } from "../components/layout.i18n";
import {
  permissionDeniedEn,
  permissionDeniedJa,
} from "../components/permission-denied.i18n";
import {
  projectCreateFormEn,
  projectCreateFormJa,
} from "../components/project-create-form.i18n";
import {
  releaseMarkerCreateDialogEn,
  releaseMarkerCreateDialogJa,
} from "../components/release-marker-create-dialog.i18n";
import {
  storyDeleteConfirmDialogEn,
  storyDeleteConfirmDialogJa,
} from "../components/story-delete-confirm-dialog.i18n";
import { storyPanelEn, storyPanelJa } from "../components/story-panel.i18n";
import {
  projectListContentEn,
  projectListContentJa,
} from "../components/project-list-content.i18n";
import {
  projectListItemEn,
  projectListItemJa,
} from "../components/project-list-item.i18n";
import {
  projectStoryBreadcrumbEn,
  projectStoryBreadcrumbJa,
} from "../components/project-story-breadcrumb.i18n";
import { loginScreenEn, loginScreenJa } from "../screens/login-screen.i18n";
import {
  projectCreateScreenEn,
  projectCreateScreenJa,
} from "../screens/project-create-screen.i18n";
import {
  projectListScreenEn,
  projectListScreenJa,
} from "../screens/project-list-screen.i18n";
import {
  projectMembersScreenEn,
  projectMembersScreenJa,
} from "../screens/project-members-screen.i18n";
import {
  storyEditScreenEn,
  storyEditScreenJa,
} from "../screens/story-edit-screen.i18n";
import {
  storyMultiPanelScreenEn,
  storyMultiPanelScreenJa,
} from "../screens/story-multi-panel-screen.i18n";

export const LANGUAGE_STORAGE_KEY = "tatsumaki:language";
export const DEFAULT_LANGUAGE = "ja";
export const SUPPORTED_LANGUAGES = ["ja", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function resolveInitialLanguage(): SupportedLanguage {
  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
      : null;
  return stored === "en" ? "en" : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources: {
    ja: {
      common: {
        ...layoutJa,
        ...permissionDeniedJa,
        ...errorRetryJa,
        ...projectStoryBreadcrumbJa,
        ...loginScreenJa,
        ...projectListScreenJa,
        ...projectListContentJa,
        ...projectListItemJa,
        ...projectCreateScreenJa,
        ...projectCreateFormJa,
        ...projectMembersScreenJa,
        ...storyMultiPanelScreenJa,
        ...storyEditScreenJa,
        ...storyDeleteConfirmDialogJa,
        ...releaseMarkerCreateDialogJa,
        ...storyPanelJa,
      },
    },
    en: {
      common: {
        ...layoutEn,
        ...permissionDeniedEn,
        ...errorRetryEn,
        ...projectStoryBreadcrumbEn,
        ...loginScreenEn,
        ...projectListScreenEn,
        ...projectListContentEn,
        ...projectListItemEn,
        ...projectCreateScreenEn,
        ...projectCreateFormEn,
        ...projectMembersScreenEn,
        ...storyMultiPanelScreenEn,
        ...storyEditScreenEn,
        ...storyDeleteConfirmDialogEn,
        ...releaseMarkerCreateDialogEn,
        ...storyPanelEn,
      },
    },
  },
  lng: resolveInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

void i18n.on("languageChanged", (language) => {
  if (typeof window === "undefined") return;
  if (language !== "ja" && language !== "en") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
});

export { i18n };
