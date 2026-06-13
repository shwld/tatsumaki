import { describe, expect, it } from "vitest";
import {
  convertLegacyMentionsToMentionLinks,
  extractMentionIdsFromText,
  insertMentionLinkAtTail,
} from "./mention-markdown";

describe("mention-markdown", () => {
  it("converts legacy @id mentions to mention links", () => {
    const converted = convertLegacyMentionsToMentionLinks(
      "hello @github|member-1 and @unknown-id",
      [
        {
          id: "github|member-1",
          displayName: "Member One",
          avatarUrl: null,
          gravatarUrl: null,
        },
      ],
    );

    expect(converted).toBe(
      "hello [@Member One](mention:github|member-1) and @unknown-id",
    );
  });

  it("does not convert mentions inside inline code", () => {
    const converted = convertLegacyMentionsToMentionLinks(
      "run `@github|member-1` now",
      [
        {
          id: "github|member-1",
          displayName: "Member One",
          avatarUrl: null,
          gravatarUrl: null,
        },
      ],
    );

    expect(converted).toBe("run `@github|member-1` now");
  });

  it("inserts mention link at markdown tail", () => {
    expect(
      insertMentionLinkAtTail("確認お願いします", {
        id: "github|member-1",
        displayName: "Member One",
      }),
    ).toBe("確認お願いします [@Member One](mention:github|member-1) ");
  });

  it("extracts mention ids from mention links and legacy mentions", () => {
    expect(
      [...extractMentionIdsFromText("[@A](mention:u1) hi @u2 @u2")].sort(),
    ).toEqual(["u1", "u2"]);
  });
});
