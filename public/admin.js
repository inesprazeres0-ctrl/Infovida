const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    const button = loginForm.querySelector("button");
    button.disabled = true;
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: new FormData(loginForm).get("password") })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nao foi possivel entrar.");
      window.location.replace("/infovida-admin.html");
    } catch (error) {
      loginError.textContent = error.message || "Nao foi possivel entrar. Tente novamente.";
      loginError.hidden = false;
      loginForm.querySelector("input").focus();
    } finally {
      button.disabled = false;
    }
  });
}

const list = document.querySelector("#submission-list");
const count = document.querySelector("#submission-count");
const emptyState = document.querySelector("#empty-state");
const dashboardError = document.querySelector("#dashboard-error");
const clearSubmissionsButton = document.querySelector("#clear-submissions-button");

function addDetail(container, label, value, link) {
  const item = document.createElement("div");
  item.className = "detail-item";
  const title = document.createElement("span");
  title.className = "detail-label";
  title.textContent = label;
  const content = document.createElement(link ? "a" : "span");
  content.className = link ? "detail-value whatsapp-link" : "detail-value";
  content.textContent = value;
  if (link) {
    content.href = link;
    content.target = "_blank";
    content.rel = "noopener noreferrer";
  }
  item.append(title, content);
  container.append(item);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data nao informada"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function createSubmissionRow(person) {
  const article = document.createElement("article");
  article.className = "submission-row";
  const summary = document.createElement("div");
  summary.className = "submission-summary";
  const mark = document.createElement("span");
  mark.className = "person-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = person.name.trim().charAt(0) || "?";
  const primary = document.createElement("div");
  primary.className = "person-primary";
  const name = document.createElement("p");
  name.className = "person-name";
  name.textContent = person.name;
  const meta = document.createElement("p");
  meta.className = "person-meta";
  const audienceLabel = person.audience === "servidor-publico" ? "Servidor público" : "Seguro de pessoas";
  meta.textContent = `${person.profession} · ${audienceLabel} · Recebido em ${formatDate(person.createdAt)}`;
  primary.append(name, meta);
  const toggle = document.createElement("button");
  toggle.className = "expand-button";
  toggle.type = "button";
  toggle.textContent = "Exibir mais";
  toggle.setAttribute("aria-expanded", "false");
  const details = document.createElement("div");
  details.className = "submission-details";
  details.hidden = true;
  const children = person.hasChildren
    ? `Sim, ${person.childrenCount} ${person.childrenCount === 1 ? "filho(a)" : "filhos"}`
    : "Nao";
  addDetail(details, "Nascimento ou idade", person.ageOrBirthdate);
  addDetail(details, "Formulário", person.audience === "servidor-publico" ? "Servidor público" : "Seguro de pessoas");
  addDetail(details, "Profissao / atividade", person.profession);
  addDetail(details, "Estado civil", person.maritalStatus);
  const gender = person.gender === "Outro"
    ? `Outro: ${person.genderOther || "N\u00E3o informado"}`
    : person.gender || "N\u00E3o informado";
  addDetail(details, "Sexo / g\u00EAnero", gender);
  addDetail(details, "Filhos", children);
  const digits = person.whatsapp.replace(/\D/g, "");
  const whatsappHref = `https://wa.me/55${digits}`;
  addDetail(details, "WhatsApp", person.whatsapp, whatsappHref);
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    toggle.textContent = expanded ? "Exibir mais" : "Exibir menos";
    details.hidden = expanded;
  });
  summary.append(mark, primary, toggle);
  article.append(summary, details);
  return article;
}

async function loadSubmissions() {
  if (!list) return;
  dashboardError.hidden = true;
  count.textContent = "Carregando...";
  try {
    const response = await fetch("/api/admin/submissions");
    if (response.status === 401) {
      window.location.replace("/infovida-admin.html");
      return;
    }
    if (!response.ok) throw new Error("Nao foi possivel carregar a lista de contatos.");
    const submissions = await response.json();
    list.replaceChildren(...submissions.map(createSubmissionRow));
    count.textContent = `${submissions.length} ${submissions.length === 1 ? "contato" : "contatos"}`;
    emptyState.hidden = submissions.length > 0;
    clearSubmissionsButton.disabled = submissions.length === 0;
  } catch (error) {
    count.textContent = "";
    dashboardError.textContent = error.message || "Falha ao carregar os contatos.";
    dashboardError.hidden = false;
  }
}

document.querySelector("#refresh-button")?.addEventListener("click", loadSubmissions);
clearSubmissionsButton?.addEventListener("click", async () => {
  const confirmed = window.confirm("Deseja apagar todos os contatos? Esta acao nao pode ser desfeita.");
  if (!confirmed) return;

  clearSubmissionsButton.disabled = true;
  dashboardError.hidden = true;
  try {
    const response = await fetch("/api/admin/submissions", { method: "DELETE" });
    if (response.status === 401) {
      window.location.replace("/infovida-admin.html");
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Nao foi possivel limpar a lista.");
    await loadSubmissions();
  } catch (error) {
    dashboardError.textContent = error.message || "Falha ao limpar a lista.";
    dashboardError.hidden = false;
    clearSubmissionsButton.disabled = false;
  }
});
document.querySelector("#logout-button")?.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  window.location.replace("/infovida-admin.html");
});

if (list) loadSubmissions();