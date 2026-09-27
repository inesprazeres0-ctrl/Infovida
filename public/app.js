const form = document.querySelector("#contact-form");
const formError = document.querySelector("#form-error");
const successState = document.querySelector("#success-state");
const birthdateInput = document.querySelector("#birthdate");
const ageInput = document.querySelector("#age");
const childrenCount = document.querySelector("#children-count");
const childrenCountLabel = document.querySelector(".children-count");
const genderSelect = document.querySelector("#gender");
const genderOtherField = document.querySelector("#gender-other-field");
const genderOtherInput = document.querySelector("#gender-other");
const whatsappInput = document.querySelector("#whatsapp");

for (const button of document.querySelectorAll("[data-age-mode]")) {
  button.addEventListener("click", () => {
    const showAge = button.dataset.ageMode === "age";
    for (const choice of document.querySelectorAll("[data-age-mode]")) {
      const active = choice === button;
      choice.classList.toggle("is-active", active);
      choice.setAttribute("aria-pressed", String(active));
    }
    birthdateInput.hidden = showAge;
    birthdateInput.required = !showAge;
    birthdateInput.disabled = showAge;
    ageInput.hidden = !showAge;
    ageInput.required = showAge;
    ageInput.disabled = !showAge;
    (showAge ? ageInput : birthdateInput).focus();
  });
}

for (const radio of document.querySelectorAll('input[name="hasChildren"]')) {
  radio.addEventListener("change", () => {
    const hasChildren = radio.value === "yes" && radio.checked;
    childrenCountLabel.hidden = !hasChildren;
    childrenCount.disabled = !hasChildren;
    childrenCount.required = hasChildren;
  });
}

genderSelect.addEventListener("change", () => {
  const isOther = genderSelect.value === "Outro";
  genderOtherField.hidden = !isOther;
  genderOtherInput.disabled = !isOther;
  genderOtherInput.required = isOther;
  if (isOther) genderOtherInput.focus();
});

whatsappInput.addEventListener("input", () => {
  const digits = whatsappInput.value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) {
    whatsappInput.value = digits ? `(${digits}` : "";
  } else if (digits.length <= 6) {
    whatsappInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  } else if (digits.length <= 10) {
    whatsappInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  } else {
    whatsappInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const isAge = !ageInput.disabled;
  const hasChildren = formData.get("hasChildren") === "yes";
  const payload = {
    name: formData.get("name"),
    ageOrBirthdate: isAge ? `${formData.get("age")} anos` : formData.get("birthdate"),
    profession: formData.get("profession"),
    maritalStatus: formData.get("maritalStatus"),
    gender: formData.get("gender"),
    genderOther: formData.get("genderOther") || "",
    hasChildren,
    childrenCount: hasChildren ? Number(formData.get("childrenCount")) : 0,
    whatsapp: formData.get("whatsapp"),
    website: formData.get("website")
  };
  const submitButton = form.querySelector(".submit-button");
  submitButton.disabled = true;
  submitButton.querySelector("span:first-child").textContent = "Enviando...";

  try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Nao foi possivel enviar. Tente novamente.");
    form.hidden = true;
    document.querySelector(".form-lead").hidden = true;
    document.querySelector(".form-heading").hidden = true;
    successState.hidden = false;
  } catch (error) {
    formError.textContent = error.message || "Nao foi possivel enviar. Confira sua conexao e tente novamente.";
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span:first-child").textContent = "Quero receber minha simulacao";
  }
});

document.querySelector("#reset-form").addEventListener("click", () => window.location.reload());