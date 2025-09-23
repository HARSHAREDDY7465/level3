// -- Replace with your Dataverse org URL --
const baseUrl = "https://orgbc876bfc.crm8.dynamics.com"; //-------- This is Development URL ------------

// ----------- COLUMN CONFIGS -----------
const opportunityColumns = [
  { key: "name", label: "Opportunity Name", editable: true, required: true },
  { 
    key: "_parentcontactid_value", 
    label: "Customer", 
    editable: true, 
    type: "lookup", 
    lookup: { 
      entitySet: "contacts", 
      key: "contactid", 
      nameField: "fullname",
      displayFields: ["fullname","emailaddress1"]
    } 
  },
  { key: "estimatedvalue", label: "Revenue", editable: true, type: "number" },
  { key: "niq_ishostopportunity", label: "Is Host?", editable: false }
];
const quoteColumns = [
  { key: "name", label: "Quote Name", editable: true, required: true },
  { key: "statuscode", label: "Status", editable: true, type: "number" }
];
const quoteLineColumns = [
  { key: "productname", label: "Product", editable: true, required: true },
  { key: "quantity", label: "Quantity", editable: true, type: "number", required: true },
  { key: "extendedamount", label: "Total Amount", editable: false, type: "number", required: true }
];
const quoteCharacteristicColumns = [
  { key: "niq_name", label: "Feature", editable: true, required: true },
  { key: "niq_type", label: "Type", editable: true, required: true, type: "choice"},
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
  console.log("Fetching:", url);
  const headers = {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "Prefer": "odata.include-annotations=*"
  };
  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    const txt = await response.text().catch(()=>null);
    throw new Error("API error: " + response.statusText + " (" + response.status + ") " + txt);
  }
  const data = await response.json();
  return data.value || [];
}

async function patchData(entitySet, id, updateObj) {
  const guid = id.replace(/['{}]/g, '');
  const url = `${baseUrl}/api/data/v9.2/${entitySet}(${guid})`;
  console.log("PATCH:", url, updateObj);
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
  if (!response.ok) {
    const txt = await response.text().catch(()=>null);
    throw new Error("Save failed: " + response.statusText + " " + txt);
  }
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

function rowId(level, id) { return `${level}-${id}`; }

document.addEventListener("DOMContentLoaded", () => {
  try {
    currentRecordId = window.parent.Xrm.Page.data.entity.getId().replace(/[{}]/g, '');
  } catch (e) {
    const params = new URLSearchParams(window.location.search);
    currentRecordId = params.get("data");
  }
  setupFilterForm();
  renderGrid();
  document.addEventListener("click", () => {
    document.querySelectorAll(".crm-lookup-dropdown").forEach(d => d.style.display = "none");
  });
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
  let filter = typeof cfg.filter === "function" ? cfg.filter({ currentRecordId }) : (cfg.filter || "");
  if (text && text.trim()) {
    const safeText = text.replace(/'/g, "''");
    filter += (filter ? " and " : "") + `contains(name,'${safeText}')`;
  }
  currentFilter = filter;
  expandedRows = {};
  editingCell = null;
  renderGrid();
}

// --- Grid Rendering ---
function renderChildGridHeader(tbody, childCfg, level) {
  const tr = document.createElement("tr");
  tr.classList.add("child-grid-header");
  tr.dataset.level = level + 2;
  tr.innerHTML = `<th></th><th></th>` + childCfg.columns.map(c => `<th>${c.label}</th>`).join("");
  tbody.appendChild(tr);
}

function renderGridHeader(cfg) {
  const headRow = document.getElementById("crmGridHeadRow");
  headRow.innerHTML = `<th style="width:32px"></th><th style="width:24px"></th>`;
  cfg.columns.forEach(col => { headRow.innerHTML += `<th>${col.label}</th>`; });
}

async function renderGrid(level = 0, parentRecord = null) {
  const cfg = hierarchyConfig[level];
  if (level === 0 && cfg.title) document.getElementById("crmGridTitle").textContent = cfg.title;
  renderGridHeader(cfg);

  const tbody = document.getElementById("crmGridBody");
  const rowCountElem = document.getElementById("crmGridRowCount");
  const errorElem = document.getElementById("crmGridError");
  if (level === 0) { tbody.innerHTML = ""; errorElem.textContent = ""; currentRows = []; }

  try {
    let filter = "";
    if (level === 0) {
      filter = typeof cfg.filter === "function" ? cfg.filter({ currentRecordId }) : (cfg.filter || "");
      if (currentFilter && currentFilter !== filter) filter = currentFilter;
    } else if (parentRecord) {
      const parentCfg = hierarchyConfig[level - 1];
      const parentId = parentRecord[parentCfg.key];
      filter = `${cfg.parentField} eq ${formatGuid(parentId)}`;
    }

    const allCols = cfg.columns.map(f => f.key).concat([cfg.key, cfg.parentField]).filter(Boolean);
    const records = await fetchData(cfg.entitySet, Array.from(new Set(allCols)).join(","), filter);

    for (const record of records) { await renderRow(tbody, level, record); }
    if (level === 0) rowCountElem.textContent = `${currentRows.length} row(s)`;
  } catch (e) {
    if (level === 0) errorElem.textContent = e.message;
  }
}

async function renderRow(tbody, level, record) {
  const cfg = hierarchyConfig[level];
  const id = record[cfg.key];
  const rid = rowId(level, id);
  currentRows.push({ level, id });
  const tr = document.createElement("tr");
  tr.dataset.level = (level + 1); tr.dataset.rid = rid;

  // Select cell
  const tdSelect = document.createElement("td");
  tdSelect.innerHTML = `<input type="${cfg.multiple ? "checkbox" : "radio"}" name="select-${level}">`;
  tr.appendChild(tdSelect);

  // Expand icon
  const tdIcon = document.createElement("td");
  if (cfg.child !== undefined) tdIcon.innerHTML = `<i class="fa-solid fa-chevron-right crm-icon"></i>`;
  tr.appendChild(tdIcon);

  // Data cells
  cfg.columns.forEach(field => {
    const td = document.createElement("td");
    let val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] || record[field.key] || "";
    td.textContent = typeof val === "boolean" ? (val ? "Yes" : "No") : val;
    if (field.editable) { td.classList.add("crm-editable-cell"); td.onclick = () => startEditCell(tr, level, record, field, td); }
    tr.appendChild(td);
  });

  tbody.appendChild(tr);
}

// --- Lookup Search ---
async function searchLookup(entitySet, nameField, displayFields, searchText) {
  if (!searchText || !searchText.trim()) return [];
  const idField = entitySet.slice(0, -1) + "id";
  const selectFields = Array.from(new Set([...(displayFields || [nameField]), idField])).join(",");
  const filter = `contains(${nameField},'${searchText.replace(/'/g, "''")}')`;
  console.log("Lookup search:", entitySet, filter);
  const records = await fetchData(entitySet, selectFields, filter);
  return records.map(r => {
    const display = (displayFields || [nameField]).map(f => r[f] || "").filter(Boolean).join(" - ");
    return { id: r[idField], display };
  });
}

// --- Save Lookup ---
async function saveLookupEdit(level, record, field, lookupId, td) {
  if (!lookupId) return alert("Select a record from dropdown");
  const navProp = (field.key || "").replace(/^_/, "").replace(/_value$/, "");
  const update = {}; update[`${navProp}@odata.bind`] = `/${field.lookup.entitySet}(${lookupId})`;
  const cfg = hierarchyConfig[level];
  await patchData(cfg.entitySet, record[cfg.key], update);
  editingCell = null; renderGrid();
}

// --- Cell Editor ---
async function startEditCell(tr, level, record, field, td) {
  if (editingCell) return;
  editingCell = { rid: tr.dataset.rid, fieldKey: field.key };
  td.classList.add("edit-cell"); td.innerHTML = "";

  // Lookup
  if (field.type === "lookup") {
    const input = document.createElement("input");
    input.className = "crm-editbox"; input.value = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] || "";
    const dropdown = document.createElement("div");
    dropdown.className = "crm-lookup-dropdown"; td.style.position = "relative";
    td.appendChild(input); td.appendChild(dropdown);

    let timeout; let currentResults = [];
    input.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        currentResults = await searchLookup(field.lookup.entitySet, field.lookup.nameField, field.lookup.displayFields, input.value);
        dropdown.innerHTML = ""; dropdown.style.display = currentResults.length ? "block" : "none";
        currentResults.forEach(r => {
          const item = document.createElement("div"); item.className = "crm-lookup-item"; item.textContent = r.display;
          item.onclick = () => { input.value = r.display; saveLookupEdit(level, record, field, r.id, td); dropdown.style.display = "none"; };
          dropdown.appendChild(item);
        });
      }, 300);
    });
    input.onkeydown = (ev) => { if (ev.key === "Escape") { editingCell = null; renderGrid(); } };
    input.focus(); return;
  }

  // Text / Number
  const input = document.createElement("input");
  input.className = "crm-editbox"; input.type = field.type === "number" ? "number" : "text";
  input.value = record[field.key] ?? "";
  input.onkeydown = async (ev) => {
    if (ev.key === "Enter") {
      const update = {}; update[field.key] = field.type === "number" ? Number(input.value) : input.value;
      await patchData(hierarchyConfig[level].entitySet, record[hierarchyConfig[level].key], update);
      editingCell = null; renderGrid();
    }
    if (ev.key === "Escape") { editingCell = null; renderGrid(); }
  };
  td.appendChild(input); input.focus();
}
