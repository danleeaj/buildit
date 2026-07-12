const INITIAL_STATE = Object.freeze({
  userId: null,
  projects: [],
  listStatus: "idle",
  listError: "",
  activeProjectId: null,
  saveStatus: "idle",
  saveError: "",
});

function readableProjectError(error) {
  if (error?.code === "unauthorized") return "Your session expired. Sign in again.";
  if (error?.code === "auth_configuration") return "Project storage is not configured.";
  if (error?.code === "network") return "Could not reach project storage.";
  return error instanceof Error ? error.message : "Project storage did not respond.";
}

export function createProjectPersistence({ request }) {
  let state = { ...INITIAL_STATE };
  let pendingPayload = null;
  let failedPayload = null;
  let workerPromise = null;
  let epoch = 0;
  const listeners = new Set();

  const notify = () => listeners.forEach((listener) => listener());
  const publish = (patch) => {
    state = { ...state, ...patch };
    notify();
  };

  async function loadProjects() {
    if (!state.userId) return;
    const requestEpoch = epoch;
    publish({ listStatus: "loading", listError: "" });
    try {
      const { projects } = await request("/api/projects");
      if (requestEpoch !== epoch) return;
      publish({
        projects: Array.isArray(projects) ? projects : [],
        listStatus: "ready",
        listError: "",
      });
    } catch (error) {
      if (requestEpoch !== epoch) return;
      publish({ listStatus: "error", listError: readableProjectError(error) });
    }
  }

  async function setUser(userId) {
    epoch += 1;
    pendingPayload = null;
    failedPayload = null;
    workerPromise = null;
    state = { ...INITIAL_STATE, userId: userId || null };
    notify();
    if (userId) await loadProjects();
  }

  async function runWorker(runEpoch) {
    while (pendingPayload && runEpoch === epoch) {
      const current = pendingPayload;
      pendingPayload = null;
      failedPayload = current;
      publish({ saveStatus: "saving", saveError: "" });
      try {
        if (state.activeProjectId) {
          await request(`/api/projects/${state.activeProjectId}/versions`, {
            method: "POST",
            body: current,
          });
        } else {
          const { project } = await request("/api/projects", {
            method: "POST",
            body: current,
          });
          if (runEpoch !== epoch) return;
          publish({ activeProjectId: project.id });
        }
        failedPayload = null;
      } catch (error) {
        failedPayload = pendingPayload || current;
        pendingPayload = null;
        if (runEpoch === epoch) {
          publish({
            saveStatus: "error",
            saveError: readableProjectError(error),
          });
        }
        return;
      }
    }
    if (runEpoch !== epoch) return;
    publish({ saveStatus: "saved", saveError: "" });
    void loadProjects();
  }

  function save(payload) {
    if (!state.userId) return Promise.resolve();
    pendingPayload = payload;
    failedPayload = payload;
    if (!workerPromise) {
      const runEpoch = epoch;
      const currentWorker = runWorker(runEpoch).finally(() => {
        if (workerPromise === currentWorker) workerPromise = null;
      });
      workerPromise = currentWorker;
    }
    return workerPromise;
  }

  function retry() {
    return failedPayload ? save(failedPayload) : Promise.resolve();
  }

  async function openProject(projectId) {
    try {
      const { project } = await request(`/api/projects/${projectId}`);
      publish({
        activeProjectId: project.id,
        saveStatus: "saved",
        saveError: "",
        listError: "",
      });
      return project;
    } catch (error) {
      publish({
        listStatus: "error",
        listError: readableProjectError(error),
      });
      throw error;
    }
  }

  function startNewProject() {
    pendingPayload = null;
    failedPayload = null;
    publish({
      activeProjectId: null,
      saveStatus: "idle",
      saveError: "",
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return state;
    },
    setUser,
    loadProjects,
    openProject,
    save,
    retry,
    startNewProject,
    dispose() {
      epoch += 1;
      listeners.clear();
    },
  };
}
