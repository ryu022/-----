import { ROUTES } from "../config/constants.js";

const listeners = [];

const sanitizeRoute = (route) => {
  if (!route) {
    return ROUTES.HOME;
  }

  return Object.values(ROUTES).includes(route) ? route : ROUTES.HOME;
};

export const getCurrentRoute = () => {
  const raw = window.location.hash.replace("#", "");
  return sanitizeRoute(raw);
};

export const navigate = (route) => {
  const next = sanitizeRoute(route);
  if (getCurrentRoute() === next) {
    return;
  }
  window.location.hash = next;
};

export const onRouteChange = (callback) => {
  listeners.push(callback);
};

// ハッシュ変更を購読者に通知し、描画責務をrouter外に保つ。
const notifyRouteChange = () => {
  const route = getCurrentRoute();
  listeners.forEach((listener) => listener(route));
};

export const initRouter = () => {
  window.addEventListener("hashchange", notifyRouteChange);
  if (!window.location.hash) {
    window.location.hash = ROUTES.HOME;
  } else {
    notifyRouteChange();
  }
};
