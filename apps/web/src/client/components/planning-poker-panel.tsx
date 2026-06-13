import { useState } from "react";
import { Avatar } from "./avatar";
import { UNKNOWN_MEMBER_DISPLAY_NAME } from "../../lib/member-display-name";
import { useToast } from "../contexts/toast-context";
import { parseErrorMessage } from "../lib/parse-error-message";
import {
  projectPlanningPokerApplyApiPath,
  projectPlanningPokerResetApiPath,
  projectPlanningPokerRevealApiPath,
  projectPlanningPokerVotesApiPath,
} from "../lib/story-routes";
import type { PlanningPokerSession } from "../types/planning-poker";
import type { ProjectMemberProfile } from "../types/project";
import type { Story } from "../types/story";

const VOTE_OPTIONS = [0, 1, 2, 3, 5, 8, 13] as const;

type Props = {
  projectId: string;
  storyId: string;
  session: PlanningPokerSession | null;
  setSession: (session: PlanningPokerSession | null) => void;
  loading: boolean;
  error: string | null;
  memberOptions: ProjectMemberProfile[];
  onStoryApplied: (story: Story) => void;
};

export function PlanningPokerPanel({
  projectId,
  storyId,
  session,
  setSession,
  loading,
  error,
  memberOptions,
  onStoryApplied,
}: Props) {
  const { showToast } = useToast();
  const [consensusPoint, setConsensusPoint] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  const run = async <T,>(
    input: RequestInfo,
    init?: RequestInit,
  ): Promise<T> => {
    setSubmitting(true);
    try {
      const response = await fetch(input, init);
      if (!response.ok) throw new Error(await parseErrorMessage(response));
      return (await response.json()) as T;
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (point: number) => {
    if (!session) return;
    try {
      const payload = await run<{ session: PlanningPokerSession }>(
        projectPlanningPokerVotesApiPath(projectId, session.id),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ point }),
        },
      );
      setSession(payload.session);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to vote");
    }
  };

  const reveal = async () => {
    if (!session) return;
    try {
      const payload = await run<{ session: PlanningPokerSession }>(
        projectPlanningPokerRevealApiPath(projectId, session.id),
        { method: "POST" },
      );
      const voteCounts = new Map<number, number>();
      for (const vote of payload.session.votes) {
        if (typeof vote.point !== "number") continue;
        voteCounts.set(vote.point, (voteCounts.get(vote.point) ?? 0) + 1);
      }
      if (voteCounts.size > 0) {
        let bestPoint = consensusPoint;
        let bestCount = -1;
        for (const [point, count] of voteCounts.entries()) {
          if (count > bestCount || (count === bestCount && point > bestPoint)) {
            bestPoint = point;
            bestCount = count;
          }
        }
        setConsensusPoint(bestPoint);
      }
      setSession(payload.session);
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to reveal votes",
      );
    }
  };

  const apply = async () => {
    if (!session) return;
    try {
      const payload = await run<{
        session: PlanningPokerSession;
        story: Story;
      }>(projectPlanningPokerApplyApiPath(projectId, session.id), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyPoint: consensusPoint }),
      });
      setSession(null);
      onStoryApplied(payload.story);
      showToast("success", "合意ポイントをストーリーに反映しました");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to apply story point",
      );
    }
  };

  const reset = async () => {
    if (!session) return;
    try {
      const payload = await run<{ session: PlanningPokerSession }>(
        projectPlanningPokerResetApiPath(projectId, session.id),
        { method: "POST" },
      );
      setSession(payload.session);
      showToast("success", "セッションをリセットしました");
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Failed to reset session",
      );
    }
  };

  if (!session || session.storyId !== storyId || session.status === "Closed") {
    return null;
  }

  const canVote = session.status === "Open";
  const canReveal = session.status === "Open";
  const canApply = session.status === "Revealed";
  const isRevealed = session.status === "Revealed";
  const votedUserIds = new Set(session.votes.map((vote) => vote.userId));
  const voteByUserId = new Map(
    session.votes.map((vote) => [vote.userId, vote.point]),
  );
  const membersById = new Map(
    memberOptions.map((member) => [member.id, member]),
  );
  const participants = session.participants
    .filter((participant) => participant.connected)
    .map((participant) => participant.userId);

  return (
    <section className="space-y-3">
      {loading ? <p className="text-xs text-gray-600">Loading...</p> : null}
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      <div className="space-y-3">
        <p className="text-xs font-medium text-gray-800">
          {session.storyTitle}
        </p>
        <p className="text-xs text-gray-700">
          Status: {session.status} / Votes: {session.totalVotes}
        </p>
        <div className="rounded border border-gray-200 bg-gray-50 p-2">
          <p className="mb-1 text-[11px] font-medium text-gray-700">
            Participants
          </p>
          <div className="space-y-1">
            {participants.map((participantUserId) => {
              const member = membersById.get(participantUserId);
              const displayName =
                member?.displayName ?? UNKNOWN_MEMBER_DISPLAY_NAME;
              const avatarUrl = member?.avatarUrl ?? null;
              const gravatarUrl = member?.gravatarUrl ?? null;
              return (
                <div
                  key={participantUserId}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[11px] text-gray-700"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Avatar
                      size="sm"
                      displayName={displayName}
                      avatarUrl={avatarUrl}
                      gravatarUrl={gravatarUrl}
                    />
                    <span className="truncate">{displayName}</span>
                  </span>
                  <span
                    className={
                      votedUserIds.has(participantUserId)
                        ? "whitespace-nowrap text-green-700"
                        : "whitespace-nowrap text-gray-500"
                    }
                  >
                    {votedUserIds.has(participantUserId)
                      ? isRevealed
                        ? `投票済み: ${voteByUserId.get(participantUserId) ?? "-"}`
                        : "投票済み"
                      : "未投票"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VOTE_OPTIONS.map((point) => (
            <button
              key={point}
              type="button"
              className="rounded border px-2 py-1 text-xs"
              disabled={!canVote || submitting}
              onClick={() => void vote(point)}
            >
              {point}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {session.status === "Open" ? (
            <button
              type="button"
              className="rounded bg-gray-800 px-2 py-1 text-xs text-white"
              disabled={!canReveal || submitting}
              onClick={() => void reveal()}
            >
              Reveal
            </button>
          ) : null}
          {session.status === "Revealed" ? (
            <button
              type="button"
              className="rounded bg-amber-700 px-2 py-1 text-xs text-white"
              disabled={submitting}
              onClick={() => void reset()}
            >
              Reset
            </button>
          ) : null}
          <select
            className="rounded border px-2 py-1 text-xs"
            value={consensusPoint}
            onChange={(e) => setConsensusPoint(Number(e.target.value))}
          >
            {VOTE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded bg-green-700 px-2 py-1 text-xs text-white"
            disabled={!canApply || submitting}
            onClick={() => void apply()}
          >
            Apply
          </button>
        </div>
      </div>
    </section>
  );
}
