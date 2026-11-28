import type {
  ProjectNameNotifications,
  ProjectNameProvider,
} from "../ports/project-name-notifications";
export async function notifyProjectRenames(
  deps: {
    notifications: ProjectNameNotifications;
    provider: ProjectNameProvider;
  },
  limit = 50,
): Promise<void> {
  const pending = await deps.notifications.listPending(limit);
  for (const notification of pending) {
    try {
      await deps.provider.recordRenamed(notification);
      await deps.notifications.markDelivered(notification);
    } catch (error) {
      console.error("Project rename notification failed", {
        projectId: notification.projectId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
    } finally {
      await deps.notifications.markAttempt(notification.projectId);
    }
  }
}
