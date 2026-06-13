import type { Result } from "neverthrow";
import type { User } from "../entities/user";

export type CreateUserInput = {
  id: string;
  displayName: string;
  email: string;
};

export type UpdateUserInput = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
};

export const USER_REPOSITORY_ERROR = "USER_REPOSITORY_ERROR" as const;

export type UserRepositoryError = typeof USER_REPOSITORY_ERROR;

export interface UserRepository {
  findById(id: string): Promise<Result<User | null, UserRepositoryError>>;
  findByEmail(email: string): Promise<Result<User | null, UserRepositoryError>>;
  findByIds(ids: string[]): Promise<Result<User[], UserRepositoryError>>;
  create(input: CreateUserInput): Promise<Result<User, UserRepositoryError>>;
  update(
    input: UpdateUserInput,
  ): Promise<Result<User | null, UserRepositoryError>>;
  delete(id: string): Promise<Result<true, UserRepositoryError>>;
}
