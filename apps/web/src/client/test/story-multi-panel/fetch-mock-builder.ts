import { vi } from "vitest";

import type { Iteration } from "../../types/iteration";
import type { Story } from "../../types/story";
import { BASE_ITERATIONS, BASE_STORIES, PROJECT_ID } from "./fixtures";

type FetchBuilderOptions = {
  stories?: Story[];
  iterations?: Iteration[];
};

export function createStoryMultiPanelFetchMock(
  options: FetchBuilderOptions = {},
) {
  const stories = options.stories ?? BASE_STORIES;
  const iterations = options.iterations ?? BASE_ITERATIONS;
  let activeSession: {
    id: string;
    projectId: string;
    storyId: string;
    storyTitle: string;
    status: "Open" | "Revealed" | "Closed";
    totalVotes: number;
    myVotePoint: number | null;
    votes: Array<{
      userId: string;
      point: number | null;
      updatedAt: string;
      revealed: boolean;
    }>;
    participants: Array<{
      userId: string;
      connected: boolean;
    }>;
  } | null = null;

  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      input instanceof Request
        ? input.url.replace(/^https?:\/\/[^/]+/, "")
        : String(input);
    const method = (
      input instanceof Request ? input.method : (init?.method ?? "GET")
    ).toUpperCase();
    const bodyText =
      input instanceof Request
        ? await input.text()
        : typeof init?.body === "string"
          ? init.body
          : "";
    const parsedUrl = new URL(url, "http://localhost");

    if (url === "/api/projects") {
      return new Response(
        JSON.stringify({
          projects: [{ id: PROJECT_ID, name: "Alpha Project" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }

    if (url === "/api/auth/me") {
      return new Response(
        JSON.stringify({
          id: "user-1",
          email: "user-1@example.com",
          displayName: "User One",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url === `/api/projects/${PROJECT_ID}`) {
      return new Response(
        JSON.stringify({
          project: {
            id: PROJECT_ID,
            name: "Alpha Project",
            sprintDurationDays: 14,
            pointScaleType: "fibonacci",
            customPointScale: null,
            pointScale: [0, 1, 2, 3, 5, 8, 13],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url === `/api/projects/${PROJECT_ID}/iterations`) {
      return new Response(JSON.stringify({ iterations }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === `/api/projects/${PROJECT_ID}/members`) {
      return new Response(JSON.stringify({ members: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === `/api/projects/${PROJECT_ID}/labels`) {
      return new Response(JSON.stringify({ labels: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === `/api/projects/${PROJECT_ID}/saved-filters`) {
      return new Response(JSON.stringify({ filters: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === `/api/projects/${PROJECT_ID}/planning-poker/sessions/active`) {
      return new Response(JSON.stringify({ session: activeSession }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const pokerSessionsPath = `/api/projects/${PROJECT_ID}/planning-poker/sessions`;
    if (url === pokerSessionsPath && method === "POST") {
      const payload = bodyText
        ? (JSON.parse(bodyText) as { storyId?: string })
        : { storyId: undefined };
      const story = stories.find((item) => item.id === payload.storyId);
      if (!story) {
        return new Response(JSON.stringify({ error: "Story not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      activeSession = {
        id: "session-1",
        projectId: PROJECT_ID,
        storyId: story.id,
        storyTitle: story.title,
        status: "Open",
        totalVotes: 0,
        myVotePoint: null,
        votes: [],
        participants: [{ userId: "user-1", connected: true }],
      };
      return new Response(JSON.stringify({ session: activeSession }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }

    if (url === `${pokerSessionsPath}/session-1/close` && method === "POST") {
      activeSession = null;
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const storiesPath = `/api/projects/${PROJECT_ID}/stories`;
    if (url === storiesPath || url.startsWith(storiesPath + "?")) {
      const q = parsedUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
      const statusesRaw = parsedUrl.searchParams.get("statuses");
      const statuses = statusesRaw ? statusesRaw.split(",") : null;
      const iterationId = parsedUrl.searchParams.get("iterationId");
      const excludeIterationId =
        parsedUrl.searchParams.get("excludeIterationId");
      const isIceboxRaw = parsedUrl.searchParams.get("isIcebox");
      const typesRaw = parsedUrl.searchParams.get("types");
      const types = typesRaw ? typesRaw.split(",") : null;

      let filtered = stories;
      if (q) {
        filtered = filtered.filter(
          (story) =>
            story.title.toLowerCase().includes(q) ||
            story.description.toLowerCase().includes(q) ||
            story.labels.some((label) => label.toLowerCase().includes(q)),
        );
      }
      if (statuses) {
        filtered = filtered.filter((story) => statuses.includes(story.status));
      }
      if (types) {
        filtered = filtered.filter((story) => types.includes(story.type));
      }
      if (iterationId) {
        filtered = filtered.filter(
          (story) => story.iterationId === iterationId,
        );
      }
      if (excludeIterationId) {
        filtered = filtered.filter(
          (story) =>
            story.iterationId === null ||
            story.iterationId !== excludeIterationId,
        );
      }
      if (isIceboxRaw === "true") {
        filtered = filtered.filter((story) => story.isIcebox);
      }
      if (isIceboxRaw === "false") {
        filtered = filtered.filter((story) => !story.isIcebox);
      }

      return new Response(
        JSON.stringify({
          stories: filtered,
          pagination: {
            limit: 20,
            offset: 0,
            hasNext: false,
            hasPrev: false,
            nextOffset: null,
            prevOffset: null,
            total: filtered.length,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  });
}
