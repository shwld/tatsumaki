import { err, ok, type Result } from "neverthrow";
import type { EntitlementProvider } from "../ports/entitlement-provider";
import type {
  ProjectRepository,
  ProjectRepositoryError,
} from "../../domain/repositories/project-repository";

export const PROJECT_CREATION_DISABLED_ERROR =
  "PROJECT_CREATION_DISABLED_ERROR" as const;
export const ENTITLEMENT_UNAVAILABLE_ERROR =
  "ENTITLEMENT_UNAVAILABLE_ERROR" as const;

export type AuthorizeProjectCreationError =
  | typeof PROJECT_CREATION_DISABLED_ERROR
  | typeof ENTITLEMENT_UNAVAILABLE_ERROR
  | ProjectRepositoryError;

export async function authorizeProjectCreation(
  entitlementProvider: EntitlementProvider,
  projectRepository: Pick<ProjectRepository, "countOwnedProjects">,
  userId: string,
): Promise<Result<void, AuthorizeProjectCreationError>> {
  let entitlement;
  try {
    entitlement = await entitlementProvider.getEntitlement(userId);
  } catch {
    return err(ENTITLEMENT_UNAVAILABLE_ERROR);
  }

  const maxOwnedProjects = entitlement.limits.maxOwnedProjects;
  if (maxOwnedProjects === null) {
    return ok(undefined);
  }
  if (maxOwnedProjects === 0) {
    return err(PROJECT_CREATION_DISABLED_ERROR);
  }

  const ownedProjectCountResult =
    await projectRepository.countOwnedProjects(userId);
  if (ownedProjectCountResult.isErr()) {
    return err(ownedProjectCountResult.error);
  }

  if (ownedProjectCountResult.value >= maxOwnedProjects) {
    return err(PROJECT_CREATION_DISABLED_ERROR);
  }

  return ok(undefined);
}
