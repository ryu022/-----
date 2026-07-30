export const renderHeader = ({ title, canGoBack, onBack }) => {
  const header = document.createElement("header");
  header.className = "app-header";

  const left = document.createElement("div");
  left.className = "app-header__left";

  if (canGoBack) {
    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "icon-button";
    backButton.textContent = "戻る";
    backButton.addEventListener("click", onBack);
    left.appendChild(backButton);
  }

  const heading = document.createElement("h1");
  heading.className = "app-header__title";
  heading.textContent = title;

  header.append(left, heading);
  return header;
};
