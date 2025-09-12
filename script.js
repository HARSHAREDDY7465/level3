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

async function buildHierarchy() {
    let container = document.getElementById("treeContainer");
    container.innerHTML = "";

    let continents = await getContinents();
    continents.forEach(continent => {
        // ✅ Correct field names
        let continentNode = createNode(continent.mash_name, "continent");
        container.appendChild(continentNode);

        continentNode.querySelector(".expand").addEventListener("click", async () => {
            if (!continentNode.classList.contains("expanded")) {
                let countries = await getCountries(continent.mash_continentsid);
                countries.forEach(country => {
                    let countryNode = createNode(country.mash_name, "country");
                    continentNode.appendChild(countryNode);

                    countryNode.querySelector(".expand").addEventListener("click", async () => {
                        if (!countryNode.classList.contains("expanded")) {
                            let states = await getStates(country.mash_countrysid);
                            states.forEach(state => {
                                let stateNode = createNode(state.mash_name, "state");
                                countryNode.appendChild(stateNode);
                            });
                            countryNode.classList.add("expanded");
                        } else {
                            collapseNode(countryNode);
                        }
                    });
                });
                continentNode.classList.add("expanded");
            } else {
                collapseNode(continentNode);
            }
        });
    });
}

function createNode(name, type) {
    let div = document.createElement("div");
    div.className = "node " + type;
    div.innerHTML = `<span class="expand">[+]</span> ${name}`;
    return div;
}

function collapseNode(node) {
    [...node.querySelectorAll(".node")].forEach(child => child.remove());
    node.classList.remove("expanded");
}
