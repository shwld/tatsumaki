export type EpicProgress = {
  completed: number;
  remaining: number;
  total: number;
};

export type Epic = {
  __typename: "Epic";
  id: string;
  projectId: string;
  name: string;
  description: string;
  progress: EpicProgress;
  createdAt: string;
  updatedAt: string;
};
