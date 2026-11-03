"use strict";
document.addEventListener("DOMContentLoaded", () => {
  const refresh = document.getElementById("refresh");
  const sort = document.getElementById("sort");
  const message = document.getElementById("message");
  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = sort.disabled = true;
    message.textContent = "Отримання таблиці…";
    try {
      const response = await fetch("/v1/leaderboard?sort=" + encodeURIComponent(sort.value),
                                   {signal: AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      const rows = document.createDocumentFragment();
      for (const player of data.players) {
        const tr = document.createElement("tr");
        for (const value of [player.rank, player.nickname, player.resources.metal,
                             player.resources.fuel, player.resources.supplies, player.total]) {
          const td = document.createElement("td");
          td.textContent = String(value);
          tr.appendChild(td);
        }
        rows.appendChild(tr);
      }
      document.getElementById("players").replaceChildren(rows);
      message.textContent = data.player_count ? "Зареєстровано гравців: " + data.player_count :
                                               "Поки немає зареєстрованих гравців.";
    } catch {
      message.textContent = "Не вдалося отримати таблицю. Натисніть «Оновити таблицю», щоб повторити.";
    } finally {
      busy = false;
      refresh.disabled = sort.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  sort.addEventListener("change", load);
  load();
});
