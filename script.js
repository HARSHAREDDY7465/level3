Your search box is currently just an input field. It is not connected to any JavaScript filtering logic, so typing and pressing Enter won't do anything. 

Change your input to:

```html
<input
    type="text"
    id="applicationSearch"
    class="form-control form-control-sm"
    placeholder="Search by Application Name or License Name"
/>
```

Add a data attribute to each card so we can search both Application Name and License Name:

```html
<div class="card app-card mb-3"
     data-app-name="{{ app.lpi_name | downcase }}"
     data-license-name="{{ app['LT.lpi_licensename'].label | downcase }}">
```

Then add this script at the bottom of the page:

```html
<script>
document.addEventListener("DOMContentLoaded", function () {

    const searchInput = document.getElementById("applicationSearch");

    searchInput.addEventListener("keyup", function (e) {

        if (e.key === "Enter") {

            const searchText = this.value.trim().toLowerCase();

            const cards = document.querySelectorAll(".app-card");

            cards.forEach(card => {

                const appName = card.dataset.appName || "";
                const licenseName = card.dataset.licenseName || "";

                const isMatch =
                    appName.includes(searchText) ||
                    licenseName.includes(searchText);

                card.style.display = isMatch ? "" : "none";
            });
        }
    });

});
</script>
```

### Better UX (recommended)

Instead of requiring Enter, search while typing:

```javascript
searchInput.addEventListener("input", function () {

    const searchText = this.value.trim().toLowerCase();

    document.querySelectorAll(".app-card").forEach(card => {

        const appName = card.dataset.appName || "";
        const licenseName = card.dataset.licenseName || "";

        const isMatch =
            appName.includes(searchText) ||
            licenseName.includes(searchText);

        card.style.display = isMatch ? "" : "none";
    });

});
```

This will allow searching:

* Application Name (`{{ app.lpi_name }}`)
* License Name (`{{ app['LT.lpi_licensename'].label }}`)

and the records will immediately filter on the page. If you want the search to work across **all pages** (not just the current page of 5 records), you'll need to move the search into the FetchXML query and reload the page with a search parameter.
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
