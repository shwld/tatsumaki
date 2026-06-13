import { memo, useCallback } from "react";
import { Dice5, Trash2, UserCircle, Users } from "lucide-react";
import { useStoryPatch } from "../hooks/use-story-patch";
import type { ProjectMemberProfile } from "../types/project";
import type { Story } from "../types/story";
import { Avatar } from "./avatar";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

type StoryAccordionSubHeaderProps = {
  onOpenPoker?: (storyId: string) => void;
  story: Story;
  memberOptions: ProjectMemberProfile[];
  onDelete?: (story: Story) => void;
  isDeleting?: boolean;
  onStoryUpdated?: (story: Story) => void;
};

function StoryAccordionSubHeaderComponent({
  story,
  memberOptions,
  onDelete,
  isDeleting = false,
  onStoryUpdated,
  onOpenPoker,
}: StoryAccordionSubHeaderProps) {
  const { patchStory, isSaving } = useStoryPatch(
    story.projectId,
    String(story.storyNumber),
    onStoryUpdated,
    { getOptimisticBaseStory: () => story },
  );

  const handleOwnerToggle = useCallback(
    async (memberId: string, checked: boolean) => {
      const next = checked
        ? [...story.ownerIds, memberId]
        : story.ownerIds.filter((id) => id !== memberId);
      await patchStory({ ownerIds: next });
    },
    [story.ownerIds, patchStory],
  );

  const handleRequesterChange = useCallback(
    async (memberId: string | null) => {
      await patchStory({ requesterId: memberId });
    },
    [patchStory],
  );

  const owners = memberOptions.filter((m) => story.ownerIds.includes(m.id));
  const requester = memberOptions.find((m) => m.id === story.requesterId);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      {/* Owner popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="担当者を変更"
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100"
          >
            {owners.length > 0 ? (
              <span className="flex -space-x-1">
                {owners.slice(0, 3).map((owner) => (
                  <Avatar
                    key={owner.id}
                    displayName={owner.displayName}
                    avatarUrl={owner.avatarUrl}
                    gravatarUrl={owner.gravatarUrl}
                    size="sm"
                  />
                ))}
                {owners.length > 3 && (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-medium text-gray-600">
                    +{owners.length - 3}
                  </span>
                )}
              </span>
            ) : (
              <Users className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="max-h-56 w-52 overflow-y-auto">
          <p className="mb-2 text-xs font-medium text-gray-600">
            担当者（Owner）
          </p>
          {memberOptions.length === 0 ? (
            <p className="text-xs text-gray-500">候補ユーザーがいません</p>
          ) : (
            <div className="space-y-1">
              {memberOptions.map((member) => {
                const checked = story.ownerIds.includes(member.id);
                return (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isSaving}
                      onChange={(e) =>
                        void handleOwnerToggle(member.id, e.target.checked)
                      }
                      className="h-3.5 w-3.5"
                    />
                    <Avatar
                      displayName={member.displayName}
                      avatarUrl={member.avatarUrl}
                      gravatarUrl={member.gravatarUrl}
                      size="sm"
                    />
                    <span className="truncate">{member.displayName}</span>
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Requester popover */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="リクエスターを変更"
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100"
          >
            {requester ? (
              <Avatar
                displayName={requester.displayName}
                avatarUrl={requester.avatarUrl}
                gravatarUrl={requester.gravatarUrl}
                size="sm"
              />
            ) : (
              <UserCircle className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="max-h-56 w-52 overflow-y-auto">
          <p className="mb-2 text-xs font-medium text-gray-600">リクエスター</p>
          <div className="space-y-1">
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-100">
              <input
                type="radio"
                name={`requester-${story.id}`}
                checked={story.requesterId === null}
                disabled={isSaving}
                onChange={() => void handleRequesterChange(null)}
                className="h-3.5 w-3.5"
              />
              <span className="text-gray-500">未設定</span>
            </label>
            {memberOptions.map((member) => (
              <label
                key={member.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
              >
                <input
                  type="radio"
                  name={`requester-${story.id}`}
                  checked={story.requesterId === member.id}
                  disabled={isSaving}
                  onChange={() => void handleRequesterChange(member.id)}
                  className="h-3.5 w-3.5"
                />
                <Avatar
                  displayName={member.displayName}
                  avatarUrl={member.avatarUrl}
                  gravatarUrl={member.gravatarUrl}
                  size="sm"
                />
                <span className="truncate">{member.displayName}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        title="Planning Pokerを開く"
        className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
        onClick={() => onOpenPoker?.(story.id)}
      >
        <Dice5 className="h-3.5 w-3.5" />
      </button>

      {/* Delete button */}
      {onDelete ? (
        <button
          type="button"
          title="このストーリーを削除"
          className="ml-auto rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-gray-300"
          disabled={isDeleting}
          onClick={() => onDelete(story)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export const StoryAccordionSubHeader = memo(StoryAccordionSubHeaderComponent);
