import { useEffect, useMemo, useSyncExternalStore } from "react";
import { apiRequest } from "../lib/apiClient.js";
import { createProjectPersistence } from "../lib/projectPersistence.js";

export default function useProjectPersistence(userId) {
  const controller = useMemo(
    () => createProjectPersistence({ request: apiRequest }),
    [],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    void controller.setUser(userId || null);
  }, [controller, userId]);

  useEffect(() => () => controller.dispose(), [controller]);

  return {
    ...state,
    loadProjects: controller.loadProjects,
    openProject: controller.openProject,
    saveProject: controller.save,
    retrySave: controller.retry,
    startNewProject: controller.startNewProject,
  };
}
