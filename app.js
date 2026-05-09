const filterButtons = [...document.querySelectorAll(".filter")];
const searchInput = document.querySelector("#searchInput");
const cards = [...document.querySelectorAll("[data-topic]")];

let activeFilter = "all";

function normalize(value) {
  return value.trim().toLowerCase();
}

function cardMatches(card, query) {
  const topic = card.dataset.topic || "";
  const keywords = card.dataset.keywords || "";
  const text = card.innerText || "";
  const matchesFilter = activeFilter === "all" || topic.split(" ").includes(activeFilter);
  const haystack = normalize(`${topic} ${keywords} ${text}`);
  const matchesSearch = !query || haystack.includes(query);
  return matchesFilter && matchesSearch;
}

function updateCards() {
  const query = normalize(searchInput.value);
  cards.forEach((card) => {
    card.classList.toggle("is-hidden", !cardMatches(card, query));
  });
}

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    updateCards();
  });
});

searchInput.addEventListener("input", updateCards);
