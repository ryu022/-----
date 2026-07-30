import { HOME_CARDS } from "../config/constants.js";
import { createCardButton } from "../components/ui.js";

export const renderHomePage = ({ navigate }) => {
  const page = document.createElement("div");
  page.className = "page-stack";

  const grid = document.createElement("section");
  grid.className = "home-grid";

  HOME_CARDS.forEach((item) => {
    grid.appendChild(
      createCardButton({
        label: item.label,
        onClick: () => navigate(item.route)
      })
    );
  });

  page.appendChild(grid);
  return page;
};
