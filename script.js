// -- Replace with your Dataverse org URL --
const baseUrl = "https://orgbc876bfc.crm8.dynamics.com"; //-------- Development URL ------------

const opportunityColumns = [
  { key: "name", label: "Opportunity Name", editable: true, required: true },
  { key: "_parentcontactid_value", label: "Customer", editable: true, type: "lookup", lookup: { entitySet: "contacts", displayField: "fullname" } },
  { key: "estimatedvalue", label: "Revenue", editable: true, type: "number" },
  { key: "niq_ishostopportunity", label: "Is Host?", editable: false }
];
const quoteColumns = [
  { key: "name", label: "Quote Name", editable: true, required: true },
  { key: "statecode", label: "Status", editable: true, type: "choice" }
];
const quoteLineColumns = [
  { key: "productname", label: "Product", editable: true, required: true },
  { key: "quantity", label: "Quantity", editable: true, type: "number", required: true },
  { key: "extendedamount", label: "Total Amount", editable: false, type: "number", required: true }
];
const quoteCharacteristicColumns = [
  { key: "niq_name", label: "Feature", editable: true, required: true },
  { key: "niq_type", label: "Type", editable: true, required: true, type: "choice" },
  { key: "niq_char2", label: "Type2", editable: true, required: true, type: "choice" }
];

// ----------- HIERARCHY CONFIG -----------
const hierarchyConfig = [
  {
    entitySet: "opportunities",
    key: "opportunityid",
    columns: opportunityColumns,
    child: 1,
    title: "Child Opportunities",
    multiple: true,
    filter: ({ currentRecordId }) =>
      `niq_ishostopportunity eq false and _niq_originalopportunity_value eq ${formatGuid(currentRecordId)}`
  },
  {
    entitySet: "quotes",
    key: "quoteid",
    parentField: "_opportunityid_value",
    columns: quoteColumns,
    child: 2,
    title: "Quotes",
    multiple: true
  },
  {
    entitySet: "quotedetails",
    key: "quotedetailid",
    parentField: "_quoteid_value",
    columns: quoteLineColumns,
    child: 3,
    title: "Quote Lines",
    multiple: true
  },
  {
    entitySet: "niq_productcharacteristics",
    key: "niq_productcharacteristicid",
    parentField: "_niq_quotedetail_value",
    columns: quoteCharacteristicColumns,
    title: "Quote Characteristics",
    multiple: true
  }
];

// --- Dataverse fetch helper ---
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
  if (!response.ok) throw new Error("API error: " + response.statusText + " (" + response.status + ")");
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
  return;
}

function formatGuid(id) {
  if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) return `'${id}'`;
  return id;
}

// --- State ---
let currentRecordId = null;
let expandedRows = {};
let editingCell = null;
let currentRows = [];
let currentFilter = "";
let selectedRows = {};

// --- Initialize ---
document.addEventListener("DOMContentLoaded", () => {
  try {
    currentRecordId = window.parent.Xrm.Page.data.entity.getId().replace(/[{}]/g, '');
  } catch (e) {
    const params = new URLSearchParams(window.location.search);
    currentRecordId = params.get("id");
  }
  setupFilterForm();
  renderGrid();
});

function setupFilterForm() {
  const form = document.getElementById("filterForm");
  const input = document.getElementById("filterInput");
  const clearBtn = document.getElementById("clearFilterBtn");
  form.addEventListener("submit", e => {
    e.preventDefault();
    applyFilter(input.value);
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    applyFilter("");
  });
}

function applyFilter(text) {
  const cfg = hierarchyConfig[0];
  let filter;
  if (typeof cfg.filter === "function") filter = cfg.filter({ currentRecordId });
  else filter = cfg.filter || "";
  if (text && text.trim()) {
    const safeText = text.replace(/'/g, "''");
    filter += (filter ? " and " : "") + `contains(tolower(name),'${safeText.toLowerCase()}')`;
  }
  currentFilter = filter;
  expandedRows = {};
  editingCell = null;
  renderGrid();
}

// --- OptionSet Cache ---
const optionSetCache = {};
async function fetchOptionSetMetadata(entityName, fieldName, fieldType) {
  const key = `${entityName}_${fieldName}`;
  if (optionSetCache[key]) return optionSetCache[key];

  let url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${fieldName}')`;
  if (fieldType === "choice") url += "/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet";
  else if (fieldType === "boolean") url += "/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet";
  else return [];

  const headers = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Accept": "application/json",
    "Content-Type": "application/json; charset=utf-8"
  };

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) throw new Error("Failed to fetch metadata");

  const data = await response.json();
  let options = [];

  if (fieldType === "choice") {
    options = data.OptionSet.Options.map(opt => ({
      value: opt.Value,
      label: opt.Label.UserLocalizedLabel?.Label || opt.Value
    }));
  } else if (fieldType === "boolean") {
    options = [
      { value: true, label: "Yes" },
      { value: false, label: "No" }
    ];
  }

  optionSetCache[key] = options;
  return options;
}

// --- Lookup Search Helper ---
async function fetchLookupOptions(entitySet, searchText, displayField) {
  const pkField = entitySet.slice(0, -1) + "id";
  const filter = searchText ? `contains(tolower(${displayField}),'${searchText.toLowerCase()}')` : "";
  return await fetchData(entitySet, `${displayField},${pkField}`, filter);
}

// --- Grid Rendering ---
function rowId(level, id) { return `${level}-${id}`; }

async function renderGrid(level = 0, parentRecord = null) {
  const cfg = hierarchyConfig[level];
  if (level === 0 && cfg.title) document.getElementById("crmGridTitle").textContent = cfg.title;
  renderGridHeader(cfg, level);

  const tbody = document.getElementById("crmGridBody");
  const rowCountElem = document.getElementById("crmGridRowCount");
  const errorElem = document.getElementById("crmGridError");
  if (level === 0) { tbody.innerHTML = ""; errorElem.textContent = ""; currentRows = []; }

  try {
    let filter = "";
    if (level === 0) filter = typeof cfg.filter === "function" ? cfg.filter({ currentRecordId }) : (cfg.filter || "");
    else if (parentRecord) {
      const parentCfg = hierarchyConfig[level - 1];
      const parentId = parentRecord[parentCfg.key];
      filter = `${cfg.parentField} eq ${formatGuid(parentId)}`;
      if (cfg.filter) filter += (typeof cfg.filter === "function" ? " and " + cfg.filter({ currentRecordId }) : " and " + cfg.filter);
    }
    if (currentFilter && level === 0) filter = currentFilter;

    const allCols = cfg.columns.map(f => f.key).concat([cfg.key]);
    if (cfg.parentField) allCols.push(cfg.parentField);

    const records = await fetchData(cfg.entitySet, Array.from(new Set(allCols)).join(","), filter);

    for (const record of records) await renderRow(tbody, level, record, null);

    if (level === 0) rowCountElem.textContent = `${currentRows.length} row${currentRows.length !== 1 ? "s" : ""}`;
  } catch (e) { if (level === 0) errorElem.textContent = e.message; }
}

function renderGridHeader(cfg, level) {
  const headRow = document.getElementById("crmGridHeadRow");
  headRow.innerHTML = `<th style="width:32px"></th><th style="width:24px"></th>`;
  cfg.columns.forEach(col => headRow.innerHTML += `<th>${col.label}</th>`);
}

async function renderChildGridHeader(tbody, childCfg, level) {
  const tr = document.createElement("tr");
  tr.classList.add("child-grid-header");
  tr.dataset.level = level + 2;
  let thIcon = document.createElement("th");
  thIcon.style.paddingLeft = `calc(13px + ${30 * (level + 1)}px)`;
  thIcon.textContent = ""; tr.appendChild(thIcon);
  let thSelect = document.createElement("th"); thSelect.textContent = ""; tr.appendChild(thSelect);
  childCfg.columns.forEach(col => { let th = document.createElement("th"); th.textContent = col.label; tr.appendChild(th); });
  tbody.appendChild(tr);
}

async function renderRow(tbody, level, record, parentRow) {
  const cfg = hierarchyConfig[level];
  const id = record[cfg.key];
  const rid = rowId(level, id);
  currentRows.push({ level, id });
  const tr = document.createElement("tr");
  tr.dataset.level = level + 1;
  tr.dataset.rid = rid;

  // Checkbox / radio
  const tdSelect = document.createElement("td");
  const cfgMultiple = cfg.multiple ?? false;
  if (!selectedRows[level]) selectedRows[level] = new Set();
  const isChecked = selectedRows[level].has(id);
  tdSelect.innerHTML = `<input type="${cfgMultiple ? "checkbox" : "radio"}" name="select-row-level-${level}" ${isChecked ? "checked" : ""} />`;
  tdSelect.firstChild.onclick = e => { e.stopPropagation(); handleRowSelect(level, id, cfgMultiple); };
  tr.appendChild(tdSelect);

  // Expand icon
  const tdIcon = document.createElement("td");
  tdIcon.style.paddingLeft = `calc(13px + ${30 * level}px)`;
  if (cfg.child !== undefined) {
    const icon = document.createElement("i");
    icon.className = "crm-icon fa-solid fa-chevron-right";
    if (expandedRows[rid]) { icon.classList.remove("fa-chevron-right"); icon.classList.add("fa-chevron-down"); }
    icon.onclick = async e => { e.stopPropagation(); expandedRows[rid] = !expandedRows[rid]; await renderGrid(); };
    tdIcon.appendChild(icon);
  } else tdIcon.innerHTML = '<span class="crm-icon crm-icon-empty fa-solid fa-square"></span>';
  tr.appendChild(tdIcon);

  // Columns
  for (const field of cfg.columns) {
    const td = document.createElement("td");
    td.classList.add("crm-data-cell");

    let val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] ?? record[field.key];
    if (typeof val === "boolean") val = val ? "Yes" : "No";
    td.textContent = val ?? "";
    if (field.editable) td.onclick = e => startEditCell(tr, level, record, field, td);
    if (editingCell && editingCell.rid === rid && editingCell.fieldKey === field.key) td.classList.add("edit-cell");
    tr.appendChild(td);
  }

  tbody.appendChild(tr);

  // Child rows
  if (cfg.child !== undefined && expandedRows[rid]) {
    const childCfg = hierarchyConfig[level + 1];
    await renderChildGridHeader(tbody, childCfg, level);
    let childFilter = `${childCfg.parentField} eq ${formatGuid(id)}`;
    if (childCfg.filter) childFilter += (typeof childCfg.filter === "function" ? " and " + childCfg.filter({ currentRecordId }) : " and " + childCfg.filter);
    const childRecords = await fetchData(childCfg.entitySet, Array.from(new Set(childCfg.columns.map(f => f.key).concat([childCfg.key, childCfg.parentField]))).join(","), childFilter);
    for (const child of childRecords) await renderRow(tbody, level + 1, child, tr);
  }
}

// --- Row selection ---
function handleRowSelect(level, id, multiple) {
  if (!selectedRows[level]) selectedRows[level] = new Set();
  if (multiple) selectedRows[level].has(id) ? selectedRows[level].delete(id) : selectedRows[level].add(id);
  else selectedRows[level] = new Set([id]);
  renderGrid();
}

// --- Save / Cancel ---
function validateField(field, value) {
  if (field.required && (!value || value === "")) return "Required";
  if (field.type === "number" && value !== "" && isNaN(Number(value))) return "Invalid number";
  return null;
}
async function saveEdit(tr, level, record, field, input, td) {
  const value = input.value;
  const err = validateField(field, value);
  if (err) { input.classList.add("crm-validation-error"); input.setCustomValidity(err); input.reportValidity(); return; }
  const update = {};
  update[field.key] = field.type === "number" ? Number(value) : value;
  try { await patchData(hierarchyConfig[level].entitySet, record[hierarchyConfig[level].key], update); } 
  catch (e) { alert("Save failed: " + e.message); }
  editingCell = null;
  renderGrid();
}
function cancelEdit(tr, level, record, field, td) { editingCell = null; renderGrid(); }
