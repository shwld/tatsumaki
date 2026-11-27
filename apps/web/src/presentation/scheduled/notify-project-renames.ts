import { notifyProjectRenames } from "../../application/usecases/notify-project-renames";
import { D1ProjectNameNotifications } from "../../infrastructure/db/repositories/d1-project-name-notifications";
import { ControlPlaneProjectNameProvider } from "../../infrastructure/entitlements/control-plane-project-name-provider";
import type { Bindings } from "../../index";
export async function notifyProjectRenamesScheduled(
  env: Bindings,
): Promise<void> {
  if (env.ENTITLEMENT_MODE !== "control-plane" || !env.CONTROL_PLANE) return;
  try {
    await notifyProjectRenames({
      notifications: new D1ProjectNameNotifications(env.DB),
      provider: new ControlPlaneProjectNameProvider(env.CONTROL_PLANE),
    });
  } catch (error) {
    console.error("Project rename delivery failed", error);
  }
}
