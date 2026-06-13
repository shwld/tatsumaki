import { describe, expect, it } from "vitest";
import {
  canTransitionStoryStatus,
  listAllowedStoryStatusTransitions,
  requiresEstimateForTransition,
  type StoryStatus,
} from "../src/domain/entities/story";
import { getWorkflowActions } from "../src/client/lib/story-status";

describe("story status transitions", () => {
  describe("canTransitionStoryStatus", () => {
    it("allows Unstarted -> Started", () => {
      expect(canTransitionStoryStatus("Unstarted", "Started")).toBe(true);
    });

    it("allows Started -> Finished", () => {
      expect(canTransitionStoryStatus("Started", "Finished")).toBe(true);
    });

    it("allows Finished -> Delivered", () => {
      expect(canTransitionStoryStatus("Finished", "Delivered")).toBe(true);
    });

    it("allows Delivered -> Accepted", () => {
      expect(canTransitionStoryStatus("Delivered", "Accepted")).toBe(true);
    });

    it("allows Delivered -> Rejected", () => {
      expect(canTransitionStoryStatus("Delivered", "Rejected")).toBe(true);
    });

    it("allows Rejected -> Started (restart)", () => {
      expect(canTransitionStoryStatus("Rejected", "Started")).toBe(true);
    });

    it("allows Accepted -> Unstarted and Accepted -> Started", () => {
      expect(canTransitionStoryStatus("Accepted", "Unstarted")).toBe(true);
      expect(canTransitionStoryStatus("Accepted", "Started")).toBe(true);
    });

    it("disallows Accepted -> Finished/Delivered/Rejected", () => {
      const targets: StoryStatus[] = ["Finished", "Delivered", "Rejected"];
      for (const target of targets) {
        expect(canTransitionStoryStatus("Accepted", target)).toBe(false);
      }
    });

    it("disallows Rejected -> anything except Started", () => {
      const targets: StoryStatus[] = [
        "Unstarted",
        "Finished",
        "Delivered",
        "Accepted",
      ];
      for (const target of targets) {
        expect(canTransitionStoryStatus("Rejected", target)).toBe(false);
      }
    });

    it("allows same-status transition (no-op)", () => {
      expect(canTransitionStoryStatus("Started", "Started")).toBe(true);
    });
  });

  describe("listAllowedStoryStatusTransitions", () => {
    it("returns Rejected and Accepted for Delivered", () => {
      const allowed = listAllowedStoryStatusTransitions("Delivered");
      expect(allowed).toContain("Accepted");
      expect(allowed).toContain("Rejected");
    });

    it("returns Started for Rejected", () => {
      const allowed = listAllowedStoryStatusTransitions("Rejected");
      expect(allowed).toEqual(["Started"]);
    });

    it("returns Unstarted and Started for Accepted", () => {
      expect(listAllowedStoryStatusTransitions("Accepted")).toEqual([
        "Unstarted",
        "Started",
      ]);
    });
  });

  describe("requiresEstimateForTransition", () => {
    it("returns true when feature transitions to Started without estimate", () => {
      expect(requiresEstimateForTransition("Started", null, "feature")).toBe(
        true,
      );
    });

    it("returns false when feature transitions to Started with estimate", () => {
      expect(requiresEstimateForTransition("Started", 3, "feature")).toBe(
        false,
      );
    });

    it("returns false for chore transitioning to Started without estimate", () => {
      expect(requiresEstimateForTransition("Started", null, "chore")).toBe(
        false,
      );
    });

    it("returns false for bug transitioning to Started without estimate", () => {
      expect(requiresEstimateForTransition("Started", null, "bug")).toBe(false);
    });

    it("returns false for non-Started transitions without estimate", () => {
      expect(requiresEstimateForTransition("Finished", null, "feature")).toBe(
        false,
      );
      expect(requiresEstimateForTransition("Delivered", null, "feature")).toBe(
        false,
      );
    });
  });

  describe("getWorkflowActions", () => {
    it("provides Start button for Unstarted feature with estimate", () => {
      const actions = getWorkflowActions("Unstarted", 3, "feature");
      expect(actions).toEqual([
        {
          label: "Start",
          target: "Started",
          variant: "primary",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("disables Start button for Unstarted feature without estimate", () => {
      const actions = getWorkflowActions("Unstarted", null, "feature");
      expect(actions).toEqual([
        {
          label: "Start",
          target: "Started",
          variant: "primary",
          disabled: true,
          disabledReason: "見積もりが必要です",
        },
      ]);
    });

    it("enables Start button for Unstarted chore without estimate", () => {
      const actions = getWorkflowActions("Unstarted", null, "chore");
      expect(actions).toEqual([
        {
          label: "Start",
          target: "Started",
          variant: "primary",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("provides Finish button for Started", () => {
      const actions = getWorkflowActions("Started", 5, "feature");
      expect(actions).toEqual([
        {
          label: "Finish",
          target: "Finished",
          variant: "primary",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("provides Accept and Reject buttons for Delivered", () => {
      const actions = getWorkflowActions("Delivered", 5, "feature");
      expect(actions).toEqual([
        {
          label: "Accept",
          target: "Accepted",
          variant: "primary",
          disabled: false,
          disabledReason: null,
        },
        {
          label: "Reject",
          target: "Rejected",
          variant: "danger",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("provides Deliver button for Finished", () => {
      const actions = getWorkflowActions("Finished", 5, "feature");
      expect(actions).toEqual([
        {
          label: "Deliver",
          target: "Delivered",
          variant: "primary",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("provides Restart button for Rejected with estimate", () => {
      const actions = getWorkflowActions("Rejected", 5, "feature");
      expect(actions).toEqual([
        {
          label: "Restart",
          target: "Started",
          variant: "secondary",
          disabled: false,
          disabledReason: null,
        },
      ]);
    });

    it("provides no workflow action buttons for Accepted", () => {
      expect(getWorkflowActions("Accepted", 5, "feature")).toEqual([]);
    });
  });
});
