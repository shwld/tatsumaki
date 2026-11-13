import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthError } from "../contexts/auth-error-context";
import { createStoryMap } from "../lib/story-maps-api";
import {
  STORY_MAP_GOAL_MAX,
  STORY_MAP_TITLE_MAX,
} from "../../shared/story-map-limits";
import type { StoryMap } from "../types/story-map";

type Props = {
  projectId: string;
  onCancel: () => void;
  onCreated: (storyMap: StoryMap) => void;
};

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900";

export function StoryMapCreateForm({ projectId, onCancel, onCreated }: Props) {
  const { t } = useTranslation();
  const { notifySessionExpired } = useAuthError();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (title.trim() === "") {
      return setError(t("storyMapCreateForm.titleRequired"));
    }
    setSubmitting(true);
    setError(null);
    const result = await createStoryMap(projectId, {
      title,
      achievementGoal: goal,
    });
    setSubmitting(false);
    if (result.ok) return onCreated(result.value);
    if (result.status === 401) return notifySessionExpired();
    setError(
      result.status === 403
        ? t("storyMapCreateForm.forbidden")
        : result.status === 400
          ? t("storyMapCreateForm.titleRequired")
          : t("storyMapCreateForm.failed"),
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("storyMapCreateForm.title")}
      className="mb-6 max-w-xl space-y-3 rounded-md border border-gray-300 bg-white p-4"
    >
      <h2 className="text-base font-semibold text-gray-900">
        {t("storyMapCreateForm.title")}
      </h2>
      <label className="block text-sm text-gray-700">
        {t("storyMapCreateForm.titleLabel")}
        <input
          className={`mt-1 ${inputClass}`}
          value={title}
          maxLength={STORY_MAP_TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("storyMapCreateForm.goalLabel")}
        <textarea
          className={`mt-1 ${inputClass}`}
          rows={3}
          value={goal}
          maxLength={STORY_MAP_GOAL_MAX}
          onChange={(event) => setGoal(event.target.value)}
        />
        <span className="text-xs text-gray-500">
          {t("storyMapCreateForm.goalHint")}
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md border border-blue-600 bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting
            ? t("storyMapCreateForm.submitting")
            : t("storyMapCreateForm.submit")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("storyMapCreateForm.cancel")}
        </button>
      </div>
    </form>
  );
}
