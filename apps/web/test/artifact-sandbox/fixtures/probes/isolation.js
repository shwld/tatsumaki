// Runs inside the artifact. Everything it observes is written to
// window.__result (and #result) for the test to read; nothing is sent out.
const violations = [];
document.addEventListener("securitypolicyviolation", (event) => {
  violations.push({
    directive: event.effectiveDirective,
    blocked: event.blockedURI,
  });
});

const result = { info: {}, passive: {}, gesture: {}, violations };
window.__result = result;
window.__canary = "";

function publish() {
  const node = document.getElementById("result");
  if (node) node.textContent = JSON.stringify(result);
}

function describe(value) {
  if (value === undefined || value === null) return String(value);
  if (typeof value === "string") return value.slice(0, 80);
  if (typeof value === "object") return Object.prototype.toString.call(value);
  return String(value);
}

async function attempt(bucket, name, run) {
  try {
    const value = await run();
    result[bucket][name] = { allowed: true, value: describe(value) };
  } catch (error) {
    result[bucket][name] = {
      allowed: false,
      error: `${error && error.name}: ${error && error.message}`,
    };
  }
  publish();
}

function loadElement(createElement) {
  return new Promise((resolve) => {
    const element = createElement();
    element.onload = () => resolve("loaded");
    element.onerror = () => resolve("blocked");
    setTimeout(() => resolve("timeout"), 2000);
    document.body.append(element);
  });
}

window.__runPassive = async (canary, externalCanary) => {
  window.__canary = canary;
  // window.origin is the security origin; location.origin only mirrors the URL.
  result.info.origin = window.origin;
  result.info.cookieEnabled = navigator.cookieEnabled;

  await attempt(
    "passive",
    "parentDocument",
    () => window.parent.document.title,
  );
  await attempt("passive", "parentLocation", () => window.parent.location.href);
  await attempt("passive", "topLocation", () => window.top.location.href);
  await attempt("passive", "cookieRead", () => document.cookie);
  await attempt("passive", "cookieWrite", () => {
    document.cookie = "probe=1";
    return document.cookie;
  });
  await attempt("passive", "localStorage", () => {
    localStorage.setItem("probe", "1");
    return localStorage.getItem("probe");
  });
  await attempt("passive", "sessionStorage", () => {
    sessionStorage.setItem("probe", "1");
    return sessionStorage.getItem("probe");
  });
  await attempt(
    "passive",
    "indexedDB",
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("probe");
        request.onsuccess = () => resolve("opened");
        request.onerror = () => reject(request.error);
      }),
  );
  await attempt(
    "passive",
    "caches",
    async () => (await caches.open("probe")) && "opened",
  );
  await attempt("passive", "serviceWorker", () =>
    navigator.serviceWorker.register(canary + "sw.js"),
  );

  await attempt(
    "passive",
    "fetchSameOrigin",
    async () => (await fetch(canary + "fetch")).status,
  );
  await attempt(
    "passive",
    "fetchExternal",
    async () => (await fetch(externalCanary + "fetch")).status,
  );
  await attempt(
    "passive",
    "xhr",
    () =>
      new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", canary + "xhr");
        request.onload = () => resolve(request.status);
        request.onerror = () => reject(new Error("xhr failed"));
        request.send();
      }),
  );
  await attempt(
    "passive",
    "webSocket",
    () =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(canary.replace(/^http/, "ws") + "socket");
        socket.onopen = () => resolve("open");
        socket.onerror = () => reject(new Error("websocket failed"));
        setTimeout(() => reject(new Error("websocket timeout")), 2000);
      }),
  );
  await attempt(
    "passive",
    "eventSource",
    () =>
      new Promise((resolve, reject) => {
        const source = new EventSource(canary + "events");
        source.onopen = () => resolve("open");
        source.onerror = () => reject(new Error("eventsource failed"));
        setTimeout(() => reject(new Error("eventsource timeout")), 2000);
      }),
  );
  await attempt("passive", "sendBeacon", () => {
    if (!navigator.sendBeacon(canary + "beacon", "x"))
      throw new Error("beacon refused");
    return "queued";
  });
  await attempt(
    "passive",
    "worker",
    () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(canary + "worker.js");
        worker.onerror = () => reject(new Error("worker failed"));
        setTimeout(() => reject(new Error("worker timeout")), 1500);
      }),
  );
  await attempt("passive", "dynamicImport", () => import(canary + "module.js"));

  await attempt("passive", "imageSameOrigin", async () => {
    const state = await loadElement(() =>
      Object.assign(new Image(), { src: canary + "image" }),
    );
    if (state !== "loaded") throw new Error(state);
    return state;
  });
  await attempt("passive", "imageExternal", async () => {
    const state = await loadElement(() =>
      Object.assign(new Image(), { src: externalCanary + "image" }),
    );
    if (state !== "loaded") throw new Error(state);
    return state;
  });
  await attempt("passive", "scriptSameOrigin", async () => {
    const state = await loadElement(() =>
      Object.assign(document.createElement("script"), {
        src: canary + "script",
      }),
    );
    if (state !== "loaded") throw new Error(state);
    return state;
  });
  await attempt("passive", "stylesheetExternal", async () => {
    const state = await loadElement(() =>
      Object.assign(document.createElement("link"), {
        rel: "stylesheet",
        href: externalCanary + "style",
      }),
    );
    if (state !== "loaded") throw new Error(state);
    return state;
  });
  await attempt("passive", "nestedFrame", async () => {
    const state = await loadElement(() =>
      Object.assign(document.createElement("iframe"), {
        src: canary + "frame",
      }),
    );
    if (state !== "loaded") throw new Error(state);
    return state;
  });
  publish();
  return result;
};

function onClick(id, name, run) {
  document.getElementById(id).addEventListener("click", async (event) => {
    if (id === "form-submit") return; // let the form submit natively
    event.preventDefault();
    await attempt("gesture", name, run);
  });
}

onClick("open-popup", "windowOpen", () => {
  const opened = window.open(window.__canary + "popup", "_blank");
  if (!opened) throw new Error("window.open returned null");
  return "opened";
});
onClick("clipboard", "clipboardWrite", () =>
  navigator.clipboard.writeText("probe"),
);
onClick("fullscreen", "fullscreen", () =>
  document.documentElement.requestFullscreen(),
);
onClick("top-nav", "topNavigation", () => {
  window.top.location.href = window.__canary + "top-navigation";
  return "navigated";
});
onClick("self-nav", "ownNavigation", () => {
  location.href = window.__canary + "own-navigation";
  return "navigated";
});
// eval must run from a page event: when Playwright starts the call through the
// DevTools protocol, Chrome exempts it from the CSP's eval restriction.
// eslint-disable-next-line no-eval -- the point is to see the CSP refuse it
onClick("eval", "eval", () => eval("1 + 1"));
onClick("modal", "alert", () => {
  alert("probe");
  return "shown";
});

// Native elements are pointed at the canary once the test knows its URL.
window.__prepareNative = (canary) => {
  window.__canary = canary;
  document.getElementById("link-blank").href = canary + "link-blank";
  document.getElementById("download").href = canary + "download";
  const form = document.getElementById("form");
  form.action = canary + "form";
};
