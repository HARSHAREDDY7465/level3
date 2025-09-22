// -------------------- CONFIG --------------------
const baseUrl = "https://orgbc876bfc.crm8.dynamics.com"; // Your org URL

const hierarchyConfig = [
  {
    entitySet: "opportunities",
    key: "opportunityid",
    columns: [
      { key: "name", label: "Opportunity Name", editable: true, required: true },
      { key: "_parentcontactid_value", label: "Customer", editable: true, type: "lookup", lookupEntity: "contacts" },
      { key: "estimatedvalue", label: "Revenue", editable: true, type: "number" },
      { key: "niq_ishostopportunity", label: "Is Host?", editable: false, type: "boolean" }
    ],
    child: 1,
    title: "Child Opportunities",
    multiple: true,
    filter: ({ currentRecordId }) => `niq_ishostopportunity eq false and _niq_originalopportunity_value eq '${currentRecordId}'`
  },
  {
    entitySet: "quotes",
    key: "quoteid",
    parentField: "_opportunityid_value",
    columns: [
      { key: "name", label: "Quote Name", editable: true, required: true },
      { key: "statecode", label: "Status", editable: true, type: "choice" }
    ],
    child: 2,
    title: "Quotes",
    multiple: true
  },
  {
    entitySet: "quotedetails",
    key: "quotedetailid",
    parentField: "_quoteid_value",
    columns: [
      { key: "productname", label: "Product", editable: true, required: true },
      { key: "quantity", label: "Quantity", editable: true, type: "number", required: true },
      { key: "extendedamount", label: "Total Amount", editable: false, type: "number", required: true }
    ],
    child: 3,
    title: "Quote Lines",
    multiple: true
  },
  {
    entitySet: "niq_productcharacteristics",
    key: "niq_productcharacteristicid",
    parentField: "_niq_quotedetail_value",
    columns: [
      { key: "niq_name", label: "Feature", editable: true, required: true },
      { key: "niq_type", label: "Type", editable: true, required: true, type: "choice" },
      { key: "niq_char2", label: "Type2", editable: true, required: true, type: "choice" }
    ],
    title: "Quote Characteristics",
    multiple: true
  }
];

// -------------------- GLOBAL STATE --------------------
let currentRecordId = null;
let expandedRows = {};
let editingCell = null;
let currentRows = [];
let currentFilter = "";
let selectedRows = {};

// -------------------- UTILITY --------------------
function formatGuid(id) {
  if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) return `'${id}'`;
  return id;
}

// -------------------- FETCH HELPERS --------------------
async function fetchData(entitySet, selectFields, filter = "") {
  let url = `${baseUrl}/api/data/v9.2/${entitySet}?$select=${selectFields}`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  const headers = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "Prefer": "odata.include-annotations=*"
  };
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) throw new Error("API error: " + response.statusText);
  const data = await response.json();
  return data.value || [];
}

async function patchData(entitySet, id, updateObj) {
  const guid = id.replace(/['{}]/g, '');
  const url = `${baseUrl}/api/data/v9.2/${entitySet}(${guid})`;
  const headers = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "Prefer": "return=representation"
  };
  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updateObj)
  });
  if (!response.ok) throw new Error("Save failed: " + response.statusText);
}

// -------------------- LOOKUP SEARCH --------------------
async function searchLookup(entitySet, query, top = 50, skip = 0) {
  let filter = query ? `contains(tolower(name),'${query.toLowerCase()}')` : "";
  let url = `${baseUrl}/api/data/v9.2/${entitySet}?$select=contactid,name&$top=${top}`;
  if (filter) url += `&$filter=${encodeURIComponent(filter)}`;
  if (skip) url += `&$skip=${skip}`;
  const headers = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "Prefer": "odata.include-annotations=*"
  };
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error("API error: " + res.statusText);
  const data = await res.json();
  return data.value.map(item => ({ id: item.contactid, name: item.name }));
}

// -------------------- OPTION SET --------------------
const optionSetCache = {};
async function fetchOptionSet(entityName, fieldName) {
  const key = `${entityName}_${fieldName}`;
  if (optionSetCache[key]) return optionSetCache[key];
  const url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${fieldName}')?$expand=OptionSet`;
  const headers = { "Accept": "application/json" };
  const res = await fetch(url, { headers });
  const data = await res.json();
  const options = data.OptionSet.Options.map(opt => ({ value: opt.Value, label: opt.Label.UserLocalizedLabel.Label }));
  optionSetCache[key] = options;
  return options;
}

// -------------------- GRID RENDER --------------------
function rowId(level, id) { return `${level}-${id}`; }

document.addEventListener("DOMContentLoaded", () => {
  try {
    currentRecordId = window.parent.Xrm.Page.data.entity.getId().replace(/[{}]/g, '');
  } catch (e) {
    const params = new URLSearchParams(window.location.search);
    currentRecordId = params.get("id");
  }
  renderGrid();
});

async function renderGrid(level = 0, parentRecord = null) {
  const cfg = hierarchyConfig[level];
  const tbody = document.getElementById("crmGridBody");
  if (level === 0) tbody.innerHTML = "";

  let filter = "";
  if (level === 0) {
    filter = cfg.filter ? cfg.filter({ currentRecordId }) : "";
    if (currentFilter) filter = currentFilter;
  } else if (parentRecord && cfg.parentField) {
    const parentCfg = hierarchyConfig[level - 1];
    const parentId = parentRecord[parentCfg.key];
    filter = `${cfg.parentField} eq ${formatGuid(parentId)}`;
    if (cfg.filter) filter += typeof cfg.filter === "function" ? " and " + cfg.filter({ currentRecordId }) : " and " + cfg.filter;
  }

  const selectCols = cfg.columns.map(f => f.key).concat([cfg.key]);
  if (cfg.parentField) selectCols.push(cfg.parentField);

  const records = await fetchData(cfg.entitySet, Array.from(new Set(selectCols)).join(","), filter);
  for (const record of records) await renderRow(tbody, level, record);

  if (level === 0) document.getElementById("crmGridRowCount").textContent = `${records.length} row${records.length !== 1 ? "s" : ""}`;
}

async function renderRow(tbody, level, record) {
  const cfg = hierarchyConfig[level];
  const rid = rowId(level, record[cfg.key]);
  currentRows.push({ level, id: record[cfg.key] });

  const tr = document.createElement("tr");
  tr.dataset.level = (level + 1);
  tr.dataset.rid = rid;

  // SELECT CELL
  const tdSelect = document.createElement("td");
  if (!selectedRows[level]) selectedRows[level] = new Set();
  const isChecked = selectedRows[level].has(record[cfg.key]);
  tdSelect.innerHTML = `<input type="${cfg.multiple ? "checkbox" : "radio"}" ${isChecked ? "checked" : ""} />`;
  tdSelect.firstChild.onclick = e => { e.stopPropagation(); handleRowSelect(level, record[cfg.key], cfg.multiple); };
  tr.appendChild(tdSelect);

  // ICON CELL
  const tdIcon = document.createElement("td");
  tdIcon.style.paddingLeft = `calc(13px + ${30 * level}px)`;
  if (cfg.child !== undefined) {
    const icon = document.createElement("i");
    icon.className = "crm-icon fa-solid fa-chevron-right";
    if (expandedRows[rid]) { icon.classList.replace("fa-chevron-right","fa-chevron-down"); }
    icon.onclick = async e => { e.stopPropagation(); expandedRows[rid] = !expandedRows[rid]; await renderGrid(); };
    tdIcon.appendChild(icon);
  } else { tdIcon.innerHTML = '<span class="crm-icon crm-icon-empty fa-solid fa-square"></span>'; }
  tr.appendChild(tdIcon);

  // DATA CELLS
  for (const field of cfg.columns) {
    const td = document.createElement("td");
    td.classList.add("crm-data-cell");
    let val = record[field.key] ?? "";
    if (record[`${field.key}@OData.Community.Display.V1.FormattedValue`]) val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`];
    if (field.type === "boolean") val = val ? "Yes" : "No";
    td.textContent = val;
    if (field.editable) td.onclick = () => startEditCell(tr, record, field, td);
    tr.appendChild(td);
  }

  tbody.appendChild(tr);

  // CHILD GRID
  if (cfg.child !== undefined && expandedRows[rid]) {
    const childCfg = hierarchyConfig[level + 1];
    const childRecords = await fetchData(
      childCfg.entitySet,
      Array.from(new Set(childCfg.columns.map(f => f.key).concat([childCfg.key, childCfg.parentField]))).join(","),
      `${childCfg.parentField} eq ${formatGuid(record[cfg.key])}`
    );
    for (const child of childRecords) await renderRow(tbody, level + 1, child);
  }
}

// -------------------- EDIT FUNCTION --------------------
async function startEditCell(tr, record, field, td) {
  if (editingCell) return;
  editingCell = { tr, record, field };
  td.classList.add("edit-cell"); td.innerHTML = "";

  let input;

  if (field.type === "lookup") {
    input = document.createElement("input");
    input.type = "text";
    input.value = td.textContent || "";

    const showDropdown = async () => {
      const results = await searchLookup(field.lookupEntity, input.value);
      showLookupDropdown(td, input, results);
    };

    input.addEventListener("input", showDropdown);
    input.addEventListener("focus", showDropdown);

  } else if (field.type === "choice") {
    input = document.createElement("select");
    const options = await fetchOptionSet(field.entityName || "opportunity", field.key);
    options.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (record[field.key] == opt.value) o.selected = true;
      input.appendChild(o);
    });
  } else if (field.type === "boolean") {
    input = document.createElement("select");
    [["Yes", true], ["No", false]].forEach(([label, val]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      if (record[field.key] === val) o.selected = true;
      input.appendChild(o);
    });
  } else {
    input = document.createElement("input");
    input.type = field.type === "number" ? "number" : "text";
    input.value = td.textContent || "";
  }

  input.onkeydown = ev => {
    if (ev.key === "Enter") saveEdit(record, field, input, td);
    if (ev.key === "Escape") cancelEdit(td);
  };
  td.appendChild(input); 
  input.focus();
}

async function saveEdit(record, field, input, td) {
  let value; 
  const updateObj = {};
  if(field.type === "lookup") {
    value = input.dataset.id;
    if(!value) return cancelEdit(td
                                 
