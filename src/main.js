import { SumGridGame } from "./game.js";
import { SumGridUI } from "./ui.js";

const root = document.querySelector("#app");
const game = new SumGridGame();
const ui = new SumGridUI({ root, game });

game.subscribe((viewModel) => {
  ui.render(viewModel);
});

window.setInterval(() => {
  const elapsedLabel = game.tick();

  if (elapsedLabel) {
    ui.updateTimer(elapsedLabel);
  }
}, 1000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    game.pauseRound({ silent: true });
    return;
  }

  game.refresh();
});

window.addEventListener("beforeunload", () => {
  game.pauseRound({ silent: true });
  game.flush();
});
