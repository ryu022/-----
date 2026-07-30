export const createCardButton = ({ label, onClick }) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};

export const createSectionCard = ({ title, body }) => {
  const card = document.createElement("section");
  card.className = "panel-card";

  if (title) {
    const heading = document.createElement("h2");
    heading.className = "panel-card__title";
    heading.textContent = title;
    card.appendChild(heading);
  }

  if (typeof body === "string") {
    const text = document.createElement("p");
    text.className = "panel-card__text";
    text.textContent = body;
    card.appendChild(text);
  } else if (body instanceof HTMLElement) {
    card.appendChild(body);
  }

  return card;
};

export const createTabBar = ({ tabs, activeTab, onTabChange }) => {
  const nav = document.createElement("nav");
  nav.className = "tab-bar";
  nav.setAttribute("aria-label", "タブ切り替え");

  tabs.forEach((tab) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button ${tab === activeTab ? "is-active" : ""}`.trim();
    button.textContent = tab;
    button.addEventListener("click", () => onTabChange(tab));
    nav.appendChild(button);
  });

  return nav;
};

export const createPrimaryButton = ({ label, onClick }) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
};
