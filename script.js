In this file, you already have validation functions like:

* `validateCharacterCount()`
* `validateNumberRange()`
* `validateCurrentStep()`

So add **Email** and **URL** validation similarly.

### Add these functions near `validateNumberRange()` 

```javascript
function validateEmail(value) {
  const emailRegex =
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  if (!value || value.trim() === "") {
    return { isValid: true, message: "" };
  }

  return {
    isValid: emailRegex.test(value),
    message: emailRegex.test(value)
      ? ""
      : "❌ Please enter a valid email address"
  };
}

function validateUrl(value) {
  const urlRegex =
    /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;

  if (!value || value.trim() === "") {
    return { isValid: true, message: "" };
  }

  return {
    isValid: urlRegex.test(value),
    message: urlRegex.test(value)
      ? ""
      : "❌ Please enter a valid URL"
  };
}
```

---

### Add real-time validation in `renderQuestions()`

After the Number validation block, add:

```javascript
const emailInputs = container.querySelectorAll(
  'input[data-datatype="Email"]'
);

emailInputs.forEach((input) => {
  const questionId = input.dataset.questionid;
  const errorEl = container.querySelector(
    `[data-error-for="${questionId}"]`
  );

  const validateEmailInput = () => {
    const result = validateEmail(input.value);

    if (!result.isValid) {
      errorEl.textContent = result.message;
      errorEl.classList.remove("d-none");
    } else {
      errorEl.textContent = "";
      errorEl.classList.add("d-none");
    }
  };

  input.addEventListener("input", validateEmailInput);
  input.addEventListener("blur", validateEmailInput);
});
```

---

### URL validation

```javascript
const urlInputs = container.querySelectorAll(
  'input[data-datatype="URL"]'
);

urlInputs.forEach((input) => {
  const questionId = input.dataset.questionid;
  const errorEl = container.querySelector(
    `[data-error-for="${questionId}"]`
  );

  const validateUrlInput = () => {
    const result = validateUrl(input.value);

    if (!result.isValid) {
      errorEl.textContent = result.message;
      errorEl.classList.remove("d-none");
    } else {
      errorEl.textContent = "";
      errorEl.classList.add("d-none");
    }
  };

  input.addEventListener("input", validateUrlInput);
  input.addEventListener("blur", validateUrlInput);
});
```

---

### Add validation inside `validateCurrentStep()`

After the Number/Decimal validation block, add:

```javascript
if (meta.dataType === "Email" && singleInput) {
  const emailValidation = validateEmail(singleInput.value);

  if (!emailValidation.isValid) {
    isValid = false;
    errorEl.textContent = emailValidation.message;
    errorEl.classList.remove("d-none");
  }
}

if (meta.dataType === "URL" && singleInput) {
  const urlValidation = validateUrl(singleInput.value);

  if (!urlValidation.isValid) {
    isValid = false;
    errorEl.textContent = urlValidation.message;
    errorEl.classList.remove("d-none");
  }
}
```

This follows the exact same pattern used for Text and Number validations in your portal form code. 
