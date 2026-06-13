import { isAuthError } from "./api-error";
import { parseErrorMessage } from "./parse-error-message";
import { projectStoriesApiPath } from "./story-routes";
import type { Story, StoryType } from "../types/story";

export type PatchStoryTypeResult =
  | { ok: true; story: Story }
  | { ok: false; authExpired: boolean; message: string };

export async function patchStoryTypeRequest(
  projectId: string,
  storyNumber: string,
  nextType: StoryType,
): Promise<PatchStoryTypeResult> {
  try {
    const response = await fetch(
      `${projectStoriesApiPath(projectId)}/${storyNumber}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: nextType }),
      },
    );
    if (isAuthError(response.status)) {
      return { ok: false, authExpired: true, message: "session" };
    }
    if (!response.ok) {
      return {
        ok: false,
        authExpired: false,
        message: await parseErrorMessage(response),
      };
    }
    const data = (await response.json()) as { story: Story };
    return { ok: true, story: data.story };
  } catch {
    return {
      ok: false,
      authExpired: false,
      message: "network",
    };
  }
}
