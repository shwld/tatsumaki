export interface ProjectDeletionNotificationGateway {
  recordProjectDeleted(input: { projectId: string }): Promise<void>;
}
