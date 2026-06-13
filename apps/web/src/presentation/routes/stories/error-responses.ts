import { type CreateStoryError } from "../../../application/usecases/create-story";
import {
  CURRENT_ITERATION_ASSIGN_FAILED_ERROR,
  CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR,
  CURRENT_ITERATION_NOT_FOUND_ERROR,
  type CreateStoryForPanelError,
} from "../../../application/usecases/create-story-for-panel";
import { STORY_NOT_FOUND_ERROR as DELETE_STORY_NOT_FOUND_ERROR } from "../../../application/usecases/delete-story";
import {
  INVALID_STORY_ORDER_ERROR,
  type ReorderStoriesError,
} from "../../../application/usecases/reorder-stories";
import {
  NO_STORY_FIELDS_TO_UPDATE_ERROR,
  STORY_NOT_FOUND_ERROR,
  type UpdateStoryError,
} from "../../../application/usecases/update-story";
import {
  STORY_OWNER_NOT_PROJECT_MEMBER_ERROR,
  STORY_REPOSITORY_ERROR,
  STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR,
} from "../../../domain/repositories/story-repository";
import {
  INVALID_STORY_LABELS_ERROR,
  INVALID_STORY_OWNER_IDS_ERROR,
  INVALID_STORY_POINT_ERROR,
  INVALID_STORY_REQUESTER_ID_ERROR,
  INVALID_STORY_STATUS_ERROR,
  INVALID_STORY_TITLE_ERROR,
  INVALID_STORY_TYPE_ERROR,
} from "../../../application/usecases/story-input";
import { NOTIFICATION_REPOSITORY_ERROR } from "../../../domain/repositories/notification-repository";
import { STORY_TYPES } from "../../../domain/entities/story";

type ErrorResponse = {
  message: string;
  status: 400 | 404 | 409 | 500;
};

function formatStoryTypeList(): string {
  const [first, ...rest] = [...STORY_TYPES];
  const last = rest.at(-1);
  const middle = rest.slice(0, -1);
  return [first, ...middle].join(", ") + `, or ${last}`;
}

export const STORY_TYPE_ERROR_MESSAGE = `Story type must be ${formatStoryTypeList()}`;

export function toCreateStoryErrorResponse(
  error: CreateStoryError | CreateStoryForPanelError,
): ErrorResponse {
  if (error === INVALID_STORY_TITLE_ERROR) {
    return { message: "Story title is required", status: 400 };
  }

  if (error === INVALID_STORY_TYPE_ERROR) {
    return {
      message: STORY_TYPE_ERROR_MESSAGE,
      status: 400,
    };
  }

  if (error === INVALID_STORY_STATUS_ERROR) {
    return {
      message:
        "Story status must be Unstarted, Started, Finished, Delivered, Accepted, or Rejected",
      status: 400,
    };
  }

  if (error === INVALID_STORY_LABELS_ERROR) {
    return { message: "Story labels cannot contain blank values", status: 400 };
  }

  if (error === INVALID_STORY_POINT_ERROR) {
    return {
      message: "Story point must be a valid integer or null",
      status: 400,
    };
  }

  if (error === INVALID_STORY_OWNER_IDS_ERROR) {
    return { message: "Story owners must be valid user IDs", status: 400 };
  }

  if (error === INVALID_STORY_REQUESTER_ID_ERROR) {
    return { message: "Requester must be a valid user ID", status: 400 };
  }

  if (error === STORY_OWNER_NOT_PROJECT_MEMBER_ERROR) {
    return { message: "All story owners must be project members", status: 400 };
  }

  if (error === STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR) {
    return { message: "Requester must be a project member", status: 400 };
  }

  if (error === STORY_REPOSITORY_ERROR) {
    return { message: "Failed to create story", status: 500 };
  }

  if (error === NOTIFICATION_REPOSITORY_ERROR) {
    return { message: "Failed to create notifications", status: 500 };
  }

  if (error === CURRENT_ITERATION_NOT_FOUND_ERROR) {
    return {
      message: "Current iteration is not available for this project",
      status: 409,
    };
  }

  if (error === CURRENT_ITERATION_ASSIGN_FAILED_ERROR) {
    return {
      message:
        "Failed to create the story in Current panel. Please retry in a moment.",
      status: 409,
    };
  }

  if (error === CURRENT_ITERATION_ASSIGN_ROLLBACK_FAILED_ERROR) {
    return {
      message:
        "Failed to rollback story creation after Current assignment error",
      status: 500,
    };
  }

  return { message: "Unexpected error", status: 500 };
}

export function toUpdateStoryErrorResponse(
  error: UpdateStoryError,
): ErrorResponse {
  if (error === NO_STORY_FIELDS_TO_UPDATE_ERROR) {
    return { message: "At least one field is required", status: 400 };
  }

  if (error === INVALID_STORY_TITLE_ERROR) {
    return { message: "Story title is required", status: 400 };
  }

  if (error === INVALID_STORY_TYPE_ERROR) {
    return {
      message: STORY_TYPE_ERROR_MESSAGE,
      status: 400,
    };
  }

  if (error === INVALID_STORY_STATUS_ERROR) {
    return {
      message:
        "Story status must be Unstarted, Started, Finished, Delivered, Accepted, or Rejected",
      status: 400,
    };
  }

  if (
    typeof error === "object" &&
    error.code === "INVALID_STORY_STATUS_TRANSITION_ERROR"
  ) {
    const allowedMessage =
      error.allowedNext.length > 0
        ? `Move to one of: ${error.allowedNext.join(", ")} before choosing ${error.to}.`
        : "No further transition is allowed from the current status.";

    return {
      message: `Cannot change status from ${error.from} to ${error.to}. ${allowedMessage}`,
      status: 409,
    };
  }

  if (typeof error === "object" && error.code === "ESTIMATE_REQUIRED_ERROR") {
    return {
      message: `Cannot change status to ${error.targetStatus} without an estimate. Please set a story point first.`,
      status: 409,
    };
  }

  if (error === INVALID_STORY_LABELS_ERROR) {
    return { message: "Story labels cannot contain blank values", status: 400 };
  }

  if (error === INVALID_STORY_POINT_ERROR) {
    return {
      message: "Story point must be a valid integer or null",
      status: 400,
    };
  }

  if (error === INVALID_STORY_OWNER_IDS_ERROR) {
    return { message: "Story owners must be valid user IDs", status: 400 };
  }

  if (error === INVALID_STORY_REQUESTER_ID_ERROR) {
    return { message: "Requester must be a valid user ID", status: 400 };
  }

  if (error === STORY_OWNER_NOT_PROJECT_MEMBER_ERROR) {
    return { message: "All story owners must be project members", status: 400 };
  }

  if (error === STORY_REQUESTER_NOT_PROJECT_MEMBER_ERROR) {
    return { message: "Requester must be a project member", status: 400 };
  }

  if (error === STORY_NOT_FOUND_ERROR) {
    return { message: "Story not found", status: 404 };
  }

  if (error === STORY_REPOSITORY_ERROR) {
    return { message: "Failed to update story", status: 500 };
  }

  if (error === NOTIFICATION_REPOSITORY_ERROR) {
    return { message: "Failed to create notifications", status: 500 };
  }

  return { message: "Unexpected error", status: 500 };
}

export function toDeleteStoryErrorResponse(error: string): ErrorResponse {
  if (error === DELETE_STORY_NOT_FOUND_ERROR) {
    return { message: "Story not found", status: 404 };
  }

  if (error === STORY_REPOSITORY_ERROR) {
    return { message: "Failed to delete story", status: 500 };
  }

  if (error === NOTIFICATION_REPOSITORY_ERROR) {
    return { message: "Failed to create notifications", status: 500 };
  }

  return { message: "Unexpected error", status: 500 };
}

export function toReorderStoriesErrorResponse(
  error: ReorderStoriesError,
): ErrorResponse {
  if (error === INVALID_STORY_ORDER_ERROR) {
    return { message: "Invalid story order", status: 400 };
  }

  if (error === STORY_REPOSITORY_ERROR) {
    return { message: "Failed to reorder stories", status: 500 };
  }

  return { message: "Unexpected error", status: 500 };
}
