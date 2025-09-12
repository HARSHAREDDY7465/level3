const data = [
    { level: 1, id: "L1-1001", name: "Asia", children: [
        { level: 2, id: "L2-1001", name: "India", children: [
            { level: 3, id: "L3-1001", name: "Maharashtra" },
            { level: 3, id: "L3-1002", name: "Punjab" }
        ]},
        { level: 2, id: "L2-1002", name: "China", children: [
            { level: 3, id: "L3-1003", name: "Beijing" },
            { level: 3, id: "L3-1004", name: "Yunnan" }
        ]}
    ]},
    { level: 1, id: "L1-1002", name: "Europe", children: [
        { level: 2, id: "L2-1003", name: "UK", children: [
            { level: 3, id: "L3-1005", name: "Manchester" },
            { level: 3, id: "L3-1006", name: "London" }
        ]},
        { level: 2, id: "L2-1004", name: "Germany", children: [
            { level: 3, id: "L3-1007", name: "Saarland" },
            { level: 3, id: "L3-1008", name: "Bavaria" }
        ]}
    ]}
];

// create a row for grid
function createRow(item, parentId = "") {
    const tr = document.createElement("tr");
    tr.className = `level-${item.level}`;
    tr.dataset.level = item.level;
    tr.dataset.id = item.id;
    if (parentId) tr.dataset.parent = parentId;

    const tdLevel = document.createElement("td");
    const icon = document.createElement("span");

    if (item.children && item.children.length > 0) {
        icon.className = "expand-icon collapsed";
        icon.textContent = "+";
        icon.onclick = (e) => {
            e.stopPropagation();
            toggleChildren(item.id, icon);
        };
    } else {
        icon.className = "no-icon";
    }

    tdLevel.appendChild(icon);
    tdLevel.appendChild(document.createTextNode(" Level " + item.level));

    const tdId = document.createElement("td");
    tdId.textContent = item.id;

    const tdName = document.createElement("td");
    tdName.textContent = item.name;

    tr.appendChild(tdLevel);
    tr.appendChild(tdId);
    tr.appendChild(tdName);

    return tr;
}

// expand/collapse children
function toggleChildren(parentId, icon) {
    const rows = document.querySelectorAll(`[data-parent='${parentId}']`);
    const isCollapsed = icon.classList.contains("collapsed");

    rows.forEach(row => {
        if (isCollapsed) {
            // expand → show only direct children
            row.style.display = "";
        } else {
            // collapse → hide children recursively
            row.style.display = "none";

            // also reset any expanded child icons
            const childIcon = row.querySelector(".expand-icon.expanded");
            if (childIcon) {
                childIcon.classList.remove("expanded");
                childIcon.classList.add("collapsed");
                childIcon.textContent = "+";
            }

            // recursive collapse
            toggleChildren(row.dataset.id, { classList: { contains: () => true } });
        }
    });

    // update current icon
    if (isCollapsed) {
        icon.classList.remove("collapsed");
        icon.classList.add("expanded");
        icon.textContent = "-";
    } else {
        icon.classList.remove("expanded");
        icon.classList.add("collapsed");
        icon.textContent = "+";
    }
}

// render the full hierarchy
function renderGrid() {
    const tbody = document.getElementById("grid-body");
    data.forEach(level1 => {
        const row1 = createRow(level1);
        tbody.appendChild(row1);
        level1.children?.forEach(level2 => {
            const row2 = createRow(level2, level1.id);
            row2.style.display = "none";
            tbody.appendChild(row2);
            level2.children?.forEach(level3 => {
                const row3 = createRow(level3, level2.id);
                row3.style.display = "none";
                tbody.appendChild(row3);
            });
        });
    });
}

renderGrid();
