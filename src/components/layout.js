import { renderHeader } from "./header.js";

export const renderLayout = ({ title, canGoBack, onBack, content }) => {
  const shell = document.createElement("div");
  shell.className = "app-shell";

  shell.appendChild(renderHeader({ title, canGoBack, onBack }));

  const networkStatus = document.createElement("div");
  networkStatus.className = "network-status";
  networkStatus.dataset.networkStatus = "";
  networkStatus.hidden = true;
  shell.appendChild(networkStatus);

  const main = document.createElement("main");
  main.className = "app-main";
  main.appendChild(content);

  shell.appendChild(main);
  return shell;
};
