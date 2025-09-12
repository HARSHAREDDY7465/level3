async function getContinents() {
    let result = await Xrm.WebApi.retrieveMultipleRecords("new_continent", "?$select=new_name,new_continentid");
    return result.entities;
}

async function getCountries(continentId) {
    let result = await Xrm.WebApi.retrieveMultipleRecords("new_country", `?$select=new_name,new_countryid&$filter=_new_continent_value eq ${continentId}`);
    return result.entities;
}

async function getStates(countryId) {
    let result = await Xrm.WebApi.retrieveMultipleRecords("new_state", `?$select=new_name,new_stateid&$filter=_new_country_value eq ${countryId}`);
    return result.entities;
}



async function buildHierarchy() {
    let container = document.getElementById("treeContainer");
    container.innerHTML = "";

    let continents = await getContinents();
    continents.forEach(continent => {
        let continentNode = createNode(continent.new_name, "continent");
        container.appendChild(continentNode);

        continentNode.querySelector(".expand").addEventListener("click", async () => {
            if (!continentNode.classList.contains("expanded")) {
                let countries = await getCountries(continent.new_continentid);
                countries.forEach(country => {
                    let countryNode = createNode(country.new_name, "country");
                    continentNode.appendChild(countryNode);

                    countryNode.querySelector(".expand").addEventListener("click", async () => {
                        if (!countryNode.classList.contains("expanded")) {
                            let states = await getStates(country.new_countryid);
                            states.forEach(state => {
                                let stateNode = createNode(state.new_name, "state");
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
    [...node.children].forEach(child => {
        if (!child.classList.contains("expand")) {
            child.remove();
        }
    });
    node.classList.remove("expanded");
}
