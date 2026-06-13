import { err, ok, type Result } from "neverthrow";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";
import type {
  UserRepository,
  UserRepositoryError,
} from "../../domain/repositories/user-repository";

export const ACCOUNT_NOT_FOUND_ERROR = "ACCOUNT_NOT_FOUND_ERROR" as const;
export const ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR =
  "ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR" as const;
export const ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR =
  "ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR" as const;

export type AccountHasSoleOwnerProjectsError = {
  type: typeof ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR;
  projects: { id: string; name: string }[];
};

export type DeleteAccountError =
  | typeof ACCOUNT_NOT_FOUND_ERROR
  | typeof ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR
  | AccountHasSoleOwnerProjectsError
  | UserRepositoryError
  | ProjectRepositoryError;

export async function deleteAccount(
  userRepository: UserRepository,
  projectRepository: ProjectRepository,
  input: { userId: string; confirmEmail: string },
): Promise<Result<true, DeleteAccountError>> {
  const userResult = await userRepository.findById(input.userId);
  if (userResult.isErr()) return err(userResult.error);
  if (!userResult.value) return err(ACCOUNT_NOT_FOUND_ERROR);

  if (
    input.confirmEmail.trim().toLowerCase() !==
    userResult.value.email.toLowerCase()
  ) {
    return err(ACCOUNT_EMAIL_CONFIRMATION_MISMATCH_ERROR);
  }

  const soleOwnerResult = await projectRepository.listSoleOwnerProjects(
    input.userId,
  );
  if (soleOwnerResult.isErr()) return err(soleOwnerResult.error);

  if (soleOwnerResult.value.length > 0) {
    return err({
      type: ACCOUNT_HAS_SOLE_OWNER_PROJECTS_ERROR,
      projects: soleOwnerResult.value,
    });
  }

  // Domain cascade contract (executed atomically in repository via D1 batch):
  //   stories.requester_id          → NULL
  //   story_owners                  → DELETE
  //   story_timeline_entries.actor_user_id → NULL (snapshot preserved in actor_name)
  //   notifications (recipient)     → DELETE
  //   notifications.actor_user_id   → NULL
  //   project_api_keys              → DELETE
  //   project_invitations           → DELETE
  //   project_members               → DELETE
  //   users                         → DELETE
  const deleteResult = await userRepository.delete(input.userId);
  if (deleteResult.isErr()) return err(deleteResult.error);

  return ok(true);
}
