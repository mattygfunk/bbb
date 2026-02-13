const fixtures = [
  { date: "Sat 15 Feb", event: "Big Bluff Sprint", track: "Bay Park" },
  { date: "Wed 19 Feb", event: "Midweek Mile", track: "Harbour Downs" },
  { date: "Sat 22 Feb", event: "The Bluff Cup", track: "Big Bluff Bay" }
];

const tips = [
  { horse: "Storm Ledger", race: "R3", odds: "$4.20", note: "Strong late speed." },
  { horse: "Bayline Belle", race: "R5", odds: "$6.00", note: "Great barrier draw." },
  { horse: "Cash Cascade", race: "R7", odds: "$5.50", note: "Handles soft track." }
];

const ladder = [
  { rank: 1, member: "Macca", wins: 14, roi: "+18%" },
  { rank: 2, member: "Jess", wins: 12, roi: "+11%" },
  { rank: 3, member: "Rico", wins: 11, roi: "+7%" },
  { rank: 4, member: "Tahlia", wins: 9, roi: "+2%" }
];

const fixturesList = document.getElementById("fixtures-list");
fixtures.forEach((f) => {
  const el = document.createElement("article");
  el.className = "fixture";
  el.innerHTML = `<strong>${f.event}</strong><p>${f.date} • ${f.track}</p>`;
  fixturesList.appendChild(el);
});

const tipsList = document.getElementById("tips-list");
tips.forEach((t) => {
  const el = document.createElement("article");
  el.className = "tip";
  el.innerHTML = `<strong>${t.horse}</strong><p>${t.race} • ${t.odds}</p><p class="muted">${t.note}</p>`;
  tipsList.appendChild(el);
});

const ladderBody = document.getElementById("ladder-body");
ladder.forEach((r) => {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${r.rank}</td><td>${r.member}</td><td>${r.wins}</td><td>${r.roi}</td>`;
  ladderBody.appendChild(tr);
});

const joinForm = document.getElementById("join-form");
const joinMsg = document.getElementById("join-msg");
joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(joinForm);
  const name = data.get("name");
  joinMsg.textContent = `Nice one, ${name}. You're on the list.`;
  joinForm.reset();
});
