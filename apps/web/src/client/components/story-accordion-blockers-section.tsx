import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Story } from "../types/story";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export type StoryAccordionBlockersSectionProps = {
  storyId: string;
  resolvedStory: Story;
  blockerStorySearch: string;
  onBlockerStorySearchChange: (value: string) => void;
  isUpdatingBlockers: boolean;
  selectedBlockingStoryId: string;
  onSelectedBlockingStoryIdChange: (value: string) => void;
  selectedBlockedStoryId: string;
  onSelectedBlockedStoryIdChange: (value: string) => void;
  availableBlockingStories: Story[];
  availableBlockedStories: Story[];
  onUpdateBlocker: (
    method: "POST" | "DELETE",
    relation: "blockedBy" | "blocks",
    targetStoryId: string,
  ) => void;
};

function BlockerStoryCombobox({
  id,
  placeholder,
  value,
  options,
  disabled,
  onValueChange,
  searchValue,
  onSearchValueChange,
}: {
  id: string;
  placeholder: string;
  value: string;
  options: Story[];
  disabled: boolean;
  onValueChange: (storyId: string) => void;
  searchValue: string;
  onSearchValueChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? (options.find((s) => s.id === value) ?? null) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className="w-full min-w-0 truncate rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {selected ? selected.title : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command
          shouldFilter={false}
          label={t("storyAccordion.blockers.searchLabel")}
        >
          <CommandInput
            placeholder={t("storyAccordion.blockers.searchPlaceholder")}
            value={searchValue}
            onValueChange={onSearchValueChange}
            title={t("storyAccordion.blockers.searchHint")}
            className="h-8 border-0 text-xs"
          />
          <CommandList>
            <CommandEmpty className="py-2 text-xs">
              {t("storyAccordion.blockers.noCandidates")}
            </CommandEmpty>
            <CommandGroup>
              {options.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${s.title} ${s.id}`}
                  onSelect={() => {
                    onValueChange(s.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <span className="truncate">{s.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function StoryAccordionBlockersSection({
  storyId,
  resolvedStory,
  blockerStorySearch,
  onBlockerStorySearchChange,
  isUpdatingBlockers,
  selectedBlockingStoryId,
  onSelectedBlockingStoryIdChange,
  selectedBlockedStoryId,
  onSelectedBlockedStoryIdChange,
  availableBlockingStories,
  availableBlockedStories,
  onUpdateBlocker,
}: StoryAccordionBlockersSectionProps) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={`story-blockers-${storyId}`}>
      <h4
        id={`story-blockers-${storyId}`}
        className="text-xs font-semibold text-gray-700 dark:text-slate-200"
      >
        {t("storyAccordion.blockers.title")}
      </h4>
      <div className="mt-1.5 space-y-2 rounded border border-gray-200 bg-gray-50 p-1.5 dark:border-slate-700 dark:bg-slate-900/60">
        <div>
          <p className="text-xs font-medium text-gray-700 dark:text-slate-200">
            {t("storyAccordion.blockers.blockingThisStory")}
          </p>
          {resolvedStory.blockingStories?.length ? (
            <ul className="mt-0.5 space-y-0.5">
              {resolvedStory.blockingStories.map((relation) => (
                <li
                  key={`blocking-${relation.id}`}
                  className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-1.5 py-0.5 dark:border-slate-600 dark:bg-slate-900"
                >
                  <span className="truncate text-xs text-gray-800 dark:text-slate-100">
                    {relation.title}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-medium text-red-700 disabled:opacity-50"
                    disabled={isUpdatingBlockers}
                    onClick={() => {
                      void onUpdateBlocker("DELETE", "blockedBy", relation.id);
                    }}
                  >
                    {t("storyAccordion.blockers.remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className={`flex flex-row items-center gap-2 ${
              resolvedStory.blockingStories?.length ? "mt-1.5" : "mt-0.5"
            }`}
          >
            <div className="min-w-0 flex-1">
              <BlockerStoryCombobox
                id={`blocking-picker-${storyId}`}
                placeholder={t("storyAccordion.blockers.selectBlocking")}
                value={selectedBlockingStoryId}
                options={availableBlockingStories}
                disabled={isUpdatingBlockers}
                onValueChange={onSelectedBlockingStoryIdChange}
                searchValue={blockerStorySearch}
                onSearchValueChange={onBlockerStorySearchChange}
              />
            </div>
            <button
              type="button"
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:bg-gray-300 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-slate-600"
              disabled={!selectedBlockingStoryId || isUpdatingBlockers}
              onClick={() => {
                void onUpdateBlocker(
                  "POST",
                  "blockedBy",
                  selectedBlockingStoryId,
                );
                onSelectedBlockingStoryIdChange("");
              }}
            >
              {t("storyAccordion.blockers.add")}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 dark:text-slate-200">
            {t("storyAccordion.blockers.blockedByThisStory")}
          </p>
          {resolvedStory.blockedStories?.length ? (
            <ul className="mt-0.5 space-y-0.5">
              {resolvedStory.blockedStories.map((relation) => (
                <li
                  key={`blocked-${relation.id}`}
                  className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-1.5 py-0.5 dark:border-slate-600 dark:bg-slate-900"
                >
                  <span className="truncate text-xs text-gray-800 dark:text-slate-100">
                    {relation.title}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-medium text-red-700 disabled:opacity-50"
                    disabled={isUpdatingBlockers}
                    onClick={() => {
                      void onUpdateBlocker("DELETE", "blocks", relation.id);
                    }}
                  >
                    {t("storyAccordion.blockers.remove")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div
            className={`flex flex-row items-center gap-2 ${
              resolvedStory.blockedStories?.length ? "mt-1.5" : "mt-0.5"
            }`}
          >
            <div className="min-w-0 flex-1">
              <BlockerStoryCombobox
                id={`blocked-picker-${storyId}`}
                placeholder={t("storyAccordion.blockers.selectBlocked")}
                value={selectedBlockedStoryId}
                options={availableBlockedStories}
                disabled={isUpdatingBlockers}
                onValueChange={onSelectedBlockedStoryIdChange}
                searchValue={blockerStorySearch}
                onSearchValueChange={onBlockerStorySearchChange}
              />
            </div>
            <button
              type="button"
              className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:bg-gray-300 dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-slate-600"
              disabled={!selectedBlockedStoryId || isUpdatingBlockers}
              onClick={() => {
                void onUpdateBlocker("POST", "blocks", selectedBlockedStoryId);
                onSelectedBlockedStoryIdChange("");
              }}
            >
              {t("storyAccordion.blockers.add")}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
