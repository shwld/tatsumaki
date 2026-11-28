export type ProjectNameNotification = {
  projectId: string;
  name: string;
  revision: number;
};
export interface ProjectNameNotifications {
  listPending(limit: number): Promise<ProjectNameNotification[]>;
  markDelivered(notification: ProjectNameNotification): Promise<void>;
  markAttempt(projectId: string): Promise<void>;
}
export interface ProjectNameProvider {
  recordRenamed(notification: ProjectNameNotification): Promise<void>;
}
