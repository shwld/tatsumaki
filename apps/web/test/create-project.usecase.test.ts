import { describe, expect, it } from "vitest";
import {
  createProject,
  INVALID_PROJECT_NAME_ERROR,
} from "../src/application/usecases/create-project";
import { PROJECT_REPOSITORY_ERROR } from "../src/domain/repositories/project-repository";
import {
  createProjectRepositoryMock,
  repositoryErrorResult,
} from "./helpers/project-repository";

describe("createProject usecase", () => {
  it("returns err when project name is blank", async () => {
    const repository = createProjectRepositoryMock();

    const result = await createProject(repository, {
      name: "   ",
      ownerUserId: "github|test-user",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(INVALID_PROJECT_NAME_ERROR);
    }
  });

  it("trims input name before saving", async () => {
    const repository = createProjectRepositoryMock();

    const result = await createProject(repository, {
      name: "  Alpha Project  ",
      ownerUserId: "github|test-user",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.name).toBe("Alpha Project");
    }
  });

  it("returns err when repository fails", async () => {
    const repository = createProjectRepositoryMock({
      createResult: repositoryErrorResult(),
    });

    const result = await createProject(repository, {
      name: "Alpha Project",
      ownerUserId: "github|test-user",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(PROJECT_REPOSITORY_ERROR);
    }
  });
});
