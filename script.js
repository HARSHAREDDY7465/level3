async function getContinents() {
    let result = await Xrm.WebApi.retrieveMultipleRecords(
        "mash_continent",
        "?$select=mash_name,mash_continentsid"
    );
    return result.entities;
}

async function getCountries(continentId) {
    let result = await Xrm.WebApi.retrieveMultipleRecords(
        "mash_country",
        `?$select=mash_name,mash_countrysid&$filter=_mash_continent_value eq ${continentId}`
    );
    return result.entities;
}

async function getStates(countryId) {
    let result = await Xrm.WebApi.retrieveMultipleRecords(
        "mash_state",
        `?$select=mash_name,mash_statesid&$filter=_mash_country_value eq ${countryId}`
    );
    return result.entities;
}

function createRow(item, level, parentId = "", hasChildren = false) {
    const tr = document.createElement("tr");
    tr.className = `level-${level}`;
    tr.dataset.level = level;
    tr.dataset.id = item.id;
    if (parentId) tr.dataset.parent = parentId;

    const tdLevel = document.createElement("td");
    const icon = document.createElement("span");
    icon.className = "expand-icon";

    if (hasChildren) {
        icon.textContent = "+";
        icon.onclick = () => toggleChildren(item.id, level + 1, tr, hasChildren);
    }
    tdLevel.appendChild(icon);
    tdLevel.appendChild(document.createTextNode("Level " + level));

    const tdId = document.createElement("td");
    tdId.textContent = item.id;

    const tdName = document.createElement("td");
    tdName.textContent = item.name;

    tr.appendChild(tdLevel);
    tr.appendChild(tdId);
    tr.appendChild(tdName);

    return tr;
}

async function toggleChildren(parentId, level, parentRow, hasChildren) {
    const tbody = document.getElementById("grid-body");
    const expandIcon = parentRow.querySelector(".expand-icon");

    // check if already expanded
    if (expandIcon.textContent === "+") {
        expandIcon.textContent = "-";

        if (level === 2) {
            let countries = await getCountries(parentId);
            countries.forEach(country => {
                const row = createRow(
                    { id: country.mash_countrysid, name: country.mash_name },
                    2,
                    parentId,
                    true
                );
                row.style.display = "";
                tbody.insertBefore(row, parentRow.nextSibling);
            });
        } else if (level === 3) {
            let states = await getStates(parentId);
            states.forEach(state => {
                const row = createRow(
                    { id: state.mash_statesid, name: state.mash_name },
                    3,
                    parentId,
                    false
                );
                row.style.display = "";
                tbody.insertBefore(row, parentRow.nextSibling);
            });
        }
    } else {
        // collapse
        expandIcon.textContent = "+";
        const rows = document.querySelectorAll(`[data-parent='${parentId}']`);
        rows.forEach(r => r.remove());
    }
}

async function renderGrid() {
    const tbody = document.getElementById("grid-body");
    tbody.innerHTML = "";

    let continents = await getContinents();

    continents.forEach(continent => {
        const row = createRow(
            { id: continent.mash_continentsid, name: continent.mash_name },
            1,
            "",
            true
        );
        tbody.appendChild(row);
    });
}

renderGrid();
