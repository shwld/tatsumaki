export type PlanningPokerVote = {
  userId: string;
  point: number | null;
  updatedAt: string;
  revealed: boolean;
};

export type PlanningPokerSessionStatus = "Open" | "Revealed" | "Closed";

export type PlanningPokerParticipant = {
  userId: string;
  connected: boolean;
};

export type PlanningPokerSession = {
  id: string;
  projectId: string;
  storyId: string;
  storyTitle: string;
  status: PlanningPokerSessionStatus;
  consensusPoint: number | null;
  createdBy: string;
  revealedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalVotes: number;
  myVotePoint: number | null;
  viewerHasVoted?: boolean;
  participants: PlanningPokerParticipant[];
  votes: PlanningPokerVote[];
};

export type PlanningPokerSessionResponse = {
  session: PlanningPokerSession | null;
};
