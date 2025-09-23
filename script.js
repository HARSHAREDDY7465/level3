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
      displayFields: ["fullname","emailaddress1"] // optional; customize what shows in dropdown
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

// --- Dataverse fetch helper (no static data) ---
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
  if (!response.ok) {
    const text = await response.text().catch(()=>null);
    throw new Error("Save failed: " + response.statusText + (text ? " - " + text : ""));
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

// small utility to build a row id string
function rowId(level, id) {
  return `${level}-${id}`;
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    currentRecordId = window.parent.Xrm.Page.data.entity.getId().replace(/[{}]/g, '');
  } catch (e) {
    const params = new URLSearchParams(window.location.search);
    currentRecordId = params.get("data");
  }
  setupFilterForm();
  renderGrid();
  // close any open lookup dropdown on outside click
  document.addEventListener("click", (ev) => {
    const openDropdowns = document.querySelectorAll(".crm-lookup-dropdown[data-open='true']");
    openDropdowns.forEach(d => {
      d.style.display = "none";
      d.dataset.open = "false";
    });
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
  let filter;
  if (typeof cfg.filter === "function") {
    filter = cfg.filter({ currentRecordId });
  } else {
    filter = cfg.filter || "";
  }
  if (text && text.trim()) {
    const safeText = text.replace(/'/g, "''");
    filter += (filter ? " and " : "") + `contains(tolower(name),'${safeText.toLowerCase()}')`;
  }
  currentFilter = filter;
  expandedRows = {};
  editingCell = null;
  renderGrid();
}

function renderChildGridHeader(tbody, childCfg, level) {
  const tr = document.createElement("tr");
  tr.classList.add("child-grid-header");
  tr.dataset.level = level + 2;

  let thIcon = document.createElement("th");
  thIcon.style.paddingLeft = `calc(13px + ${30 * (level + 1)}px)`;
  thIcon.textContent = "";
  tr.appendChild(thIcon);

  let thSelect = document.createElement("th");
  thSelect.textContent = "";
  tr.appendChild(thSelect);

  childCfg.columns.forEach(col => {
    let th = document.createElement("th");
    th.textContent = col.label;
    tr.appendChild(th);
  });
  tbody.appendChild(tr);
}

function renderGridHeader(cfg, level) {
  const headRow = document.getElementById("crmGridHeadRow");
  headRow.innerHTML = `<th style="width:32px"></th>`;
  headRow.innerHTML += `<th style="width:24px"></th>`;
  cfg.columns.forEach(col => {
    headRow.innerHTML += `<th>${col.label}</th>`;
  });
}

async function renderGrid(level = 0, parentRecord = null) {
  const cfg = hierarchyConfig[level];
  if (level === 0 && cfg.title) {
    document.getElementById("crmGridTitle").textContent = cfg.title;
  }
  renderGridHeader(cfg, level);

  const tbody = document.getElementById("crmGridBody");
  const rowCountElem = document.getElementById("crmGridRowCount");
  const errorElem = document.getElementById("crmGridError");
  if (level === 0) {
    tbody.innerHTML = "";
    errorElem.textContent = "";
    currentRows = [];
  }
  try {
    let filter = "";
    if (level === 0) {
      if (typeof cfg.filter === "function") {
        filter = cfg.filter({ currentRecordId });
      } else {
        filter = cfg.filter || "";
      }
      if (currentFilter && currentFilter !== filter) {
        filter = currentFilter;
      }
    } else if (parentRecord) {
      const parentCfg = hierarchyConfig[level - 1];
      const parentId = parentRecord[parentCfg.key];
      filter = `${cfg.parentField} eq ${formatGuid(parentId)}`;
      if (cfg.filter) {
        if (typeof cfg.filter === "function") {
          filter += " and " + cfg.filter({ currentRecordId });
        } else {
          filter += " and " + cfg.filter;
        }
      }
    }

    const allCols = cfg.columns.map(f => f.key).concat([cfg.key]);
    if (cfg.parentField) allCols.push(cfg.parentField);

    const records = await fetchData(
      cfg.entitySet,
      Array.from(new Set(allCols)).join(","),
      filter
    );

    for (const record of records) {
      await renderRow(tbody, level, record, null);
    }
    if (level === 0)
      rowCountElem.textContent = `${currentRows.length} row${currentRows.length !== 1 ? "s" : ""}`;
  } catch (e) {
    if (level === 0) document.getElementById("crmGridError").textContent = e.message;
  }
}

async function renderRow(tbody, level, record, parentRow) {
  const cfg = hierarchyConfig[level];
  const id = record[cfg.key];
  const rid = rowId(level, id);
  currentRows.push({ level, id });
  const tr = document.createElement("tr");
  tr.dataset.level = (level + 1);
  tr.dataset.rid = rid;

  const tdSelect = document.createElement("td");
  const cfgMultiple = cfg.multiple ?? false;
  if (!selectedRows[level]) selectedRows[level] = new Set();
  const isChecked = selectedRows[level].has(id);
  tdSelect.innerHTML = `<input type="${cfgMultiple ? "checkbox" : "radio"}" 
    name="select-row-level-${level}" 
    ${isChecked ? "checked" : ""} />`;
  tdSelect.firstChild.onclick = (e) => {
    e.stopPropagation();
    handleRowSelect(level, id, cfgMultiple);
  };
  tr.appendChild(tdSelect);

  const tdIcon = document.createElement("td");
  tdIcon.style.paddingLeft = `calc(13px + ${30 * level}px)`;
  if (cfg.child !== undefined) {
    const icon = document.createElement("i");
    icon.className = "crm-icon fa-solid fa-chevron-right";
    if (expandedRows[rid]) {
      icon.classList.remove("fa-chevron-right");
      icon.classList.add("fa-chevron-down");
    }
    icon.onclick = async (e) => {
      e.stopPropagation();
      expandedRows[rid] = !expandedRows[rid];
      await renderGrid();
    };
    tdIcon.appendChild(icon);
  } else {
    tdIcon.innerHTML = '<span class="crm-icon crm-icon-empty fa-solid fa-square"></span>';
  }
  tr.appendChild(tdIcon);

  cfg.columns.forEach(field => {
    const td = document.createElement("td");
    td.classList.add("crm-data-cell");
    let val = record[field.key];

    // show formatted value for lookups & option sets
    if (record[`${field.key}@OData.Community.Display.V1.FormattedValue`]) {
      val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`];
    }

    if (typeof val === "boolean") val = val ? "Yes" : "No";
    td.textContent = val ?? "";
    if (field.editable) {
      td.classList.add("crm-editable-cell");
      td.onclick = (e) => startEditCell(tr, level, record, field, td);
    }
    tr.appendChild(td);
  });

  tbody.appendChild(tr);

  if (cfg.child !== undefined && expandedRows[rid]) {
    const childCfg = hierarchyConfig[level + 1];
    renderChildGridHeader(tbody, childCfg, level);
    let childFilter = `${childCfg.parentField} eq ${formatGuid(id)}`;
    if (childCfg.filter) {
      if (typeof childCfg.filter === "function") {
        childFilter += " and " + childCfg.filter({ currentRecordId });
      } else {
        childFilter += " and " + childCfg.filter;
      }
    }
    const childRecords = await fetchData(
      childCfg.entitySet,
      Array.from(new Set(childCfg.columns.map(f => f.key).concat([childCfg.key, childCfg.parentField]))).join(","),
      childFilter
    );
    for (const child of childRecords) {
      await renderRow(tbody, level + 1, child, tr);
    }
  }
}

function handleRowSelect(level, id, multiple) {
  if (!selectedRows[level]) selectedRows[level] = new Set();
  if (multiple) {
    if (selectedRows[level].has(id)) {
      selectedRows[level].delete(id);
    } else {
      selectedRows[level].add(id);
    }
  } else {
    selectedRows[level] = new Set([id]);
  }
  renderGrid();
}

// --- Lookup Search ---
// entitySet: "contacts", nameField: "fullname", displayFields: ["fullname","email"], searchText: "ram"
async function searchLookup(entitySet, nameField, displayFields, searchText) {
  try {
    if (!searchText || !searchText.trim()) return [];
    const search = searchText.replace(/'/g, "''").toLowerCase();
    const idField = entitySet.slice(0,-1) + "id"; // crude id derivation e.g. contacts -> contactid
    const selectFields = Array.from(new Set([...(displayFields || [nameField]), idField])).join(",");
    const filter = `contains(tolower(${nameField}),'${search}')`;
    const records = await fetchData(entitySet, selectFields, filter);
    return records.map(r => {
      const displayParts = (displayFields || [nameField]).map(f => r[f] || "").filter(Boolean);
      return { id: r[idField], display: displayParts.join(" - "), raw: r };
    });
  } catch (e) {
    console.error("lookup search failed", e);
    return [];
  }
}

// --- Save Lookup ---
// update via OData bind - compute navProp from field.key: remove leading '_' and trailing '_value'
async function saveLookupEdit(tr, level, record, field, lookupId, lookupName, td) {
  if (!lookupId) {
    alert("Please select a record from the dropdown.");
    return;
  }

  const update = {};
  // derive navigation property from field.key: _parentcontactid_value -> parentcontactid
  const navProp = (field.key || "").replace(/^_/, "").replace(/_value$/, "");
  update[`${navProp}@odata.bind`] = `/${field.lookup.entitySet}(${lookupId})`;

  try {
    const cfg = hierarchyConfig[level];
    await patchData(cfg.entitySet, record[cfg.key], update);
  } catch (e) {
    alert("Save failed: " + e.message);
  }
  editingCell = null;
  await renderGrid();
}

// --- Dynamic OptionSet Metadata Fetcher ---
const optionSetCache = {};

async function fetchOptionSetMetadata(entityName, fieldName, fieldType) {
  const key = `${entityName}_${fieldName}`;
  if (optionSetCache[key]) return optionSetCache[key];

  let url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${fieldName}')`;
  if (fieldType === "choice") {
    url += "/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet";
  } else if (fieldType === "boolean") {
    url += "/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet";
  } else {
    return [];
  }

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

// --- Validation & Save for non-lookup fields ---
function validateField(field, value) {
  if (field.required && (!value || value === "")) return "Required";
  if (field.type === "number" && value !== "" && isNaN(Number(value))) return "Invalid number";
  return null;
}

async function saveEdit(tr, level, record, field, input, td) {
  const value = input.value;
  const err = validateField(field, value);
  if (err) {
    input.classList.add("crm-validation-error");
    input.setCustomValidity(err);
    input.reportValidity();
    return;
  }
  const update = {};
  if (field.type === "number") {
    update[field.key] = value === "" ? null : Number(value);
  } else if (field.type === "choice" || field.type === "boolean") {
    // option set values are numeric
    update[field.key] = value === "" ? null : Number(value);
  } else {
    update[field.key] = value;
  }

  try {
    const cfg = hierarchyConfig[level];
    await patchData(cfg.entitySet, record[cfg.key], update);
  } catch (e) {
    alert("Save failed: " + e.message);
  }
  editingCell = null;
  await renderGrid();
}

function cancelEdit(tr, level, record, field, td) {
  editingCell = null;
  renderGrid();
}

// --- Cell Editor (supports text, number, choice, boolean, lookup) ---
async function startEditCell(tr, level, record, field, td) {
  if (editingCell) return;
  const rid = tr.dataset.rid;
  editingCell = { rid, fieldKey: field.key, originalValue: record[field.key] };

  td.classList.add("edit-cell");
  td.innerHTML = '';

  // common input element
  let input;

  // CHOICE / BOOLEAN -> select populated via metadata
  if (field.type === "choice" || field.type === "boolean") {
    input = document.createElement("select");
    input.className = "crm-editbox";

    const cfg = hierarchyConfig[level];
    const entitySet = cfg.entitySet;
    const entityName = entitySet.slice(0, -1); // crude singularization

    try {
      const options = await fetchOptionSetMetadata(entityName, field.key, field.type);
      // blank option
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "--";
      input.appendChild(blank);
      options.forEach(opt => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (record[field.key] == opt.value) option.selected = true;
        input.appendChild(option);
      });
    } catch (e) {
      console.error("Metadata fetch error:", e);
      input = document.createElement("input");
      input.type = "text";
      input.value = record[field.key] ?? "";
      input.className = "crm-editbox";
    }
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") saveEdit(tr, level, record, field, input, td);
      if (ev.key === "Escape") cancelEdit(tr, level, record, field, td);
    };
    td.appendChild(input);
    setTimeout(()=>input.focus(), 0);
    return;
  }

  // LOOKUP -> autocomplete dropdown
  if (field.type === "lookup") {
    input = document.createElement("input");
    input.type = "text";
    // show formatted display if present
    input.value = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] || "";
    input.className = "crm-editbox";

    const dropdown = document.createElement("div");
    dropdown.className = "crm-lookup-dropdown";
    // basic inline styles so it works without extra CSS
    Object.assign(dropdown.style, {
      position: "absolute",
      background: "#fff",
      border: "1px solid #ccc",
      zIndex: 10000,
      display: "none",
      maxHeight: "220px",
      overflowY: "auto",
      minWidth: "200px",
      boxShadow: "0 4px 10px rgba(0,0,0,0.08)"
    });

    td.style.position = "relative";
    td.appendChild(input);
    td.appendChild(dropdown);

    // lookup config
    const lookupCfg = field.lookup || {};
    const nameField = lookupCfg.nameField;
    const displayFields = lookupCfg.displayFields || [nameField];
    const entitySet = lookupCfg.entitySet;
    const idField = lookupCfg.key || entitySet.slice(0,-1) + "id";

    // close dropdown when clicking inside grid but outside the input
    input.addEventListener("click", (ev) => {
      ev.stopPropagation();
      // prevent document click from closing immediately
      dropdown.dataset.open = "true";
    });

    // keyboard navigation state
    let focusIndex = -1;
    let currentResults = [];

    // helper to render results
    function renderResults(results) {
      dropdown.innerHTML = "";
      if (!results || !results.length) {
        const no = document.createElement("div");
        no.className = "crm-lookup-item";
        no.style.padding = "6px 8px";
        no.style.opacity = "0.7";
        no.textContent = "No results";
        dropdown.appendChild(no);
        dropdown.style.display = "block";
        dropdown.dataset.open = "true";
        return;
      }
      results.forEach((r, idx) => {
        const item = document.createElement("div");
        item.className = "crm-lookup-item";
        item.style.padding = "6px 8px";
        item.style.cursor = "pointer";
        item.style.userSelect = "none";
        item.dataset.index = idx;
        item.dataset.id = r.id;
        item.textContent = r.display || (r.raw && r.raw[nameField]) || r.id;
        item.onclick = (ev) => {
          ev.stopPropagation();
          input.value = item.textContent;
          input.dataset.lookupId = item.dataset.id;
          dropdown.style.display = "none";
          dropdown.dataset.open = "false";
          // commit save immediately on click
          saveLookupEdit(tr, level, record, field, input.dataset.lookupId, input.value, td);
        };
        dropdown.appendChild(item);
      });
      dropdown.style.display = "block";
      dropdown.dataset.open = "true";
    }

    // debounce search
    let timeout;
    input.addEventListener("input", async (ev) => {
      clearTimeout(timeout);
      // clear previously selected id when typing
      delete input.dataset.lookupId;
      focusIndex = -1;
      timeout = setTimeout(async () => {
        if (!input.value || input.value.trim().length === 0) {
          dropdown.style.display = "none";
          dropdown.dataset.open = "false";
          return;
        }
        currentResults = await searchLookup(entitySet, nameField, displayFields, input.value);
        renderResults(currentResults);
      }, 250);
    });

    // keyboard handling: arrows and enter
    input.addEventListener("keydown", (ev) => {
      const items = dropdown.querySelectorAll(".crm-lookup-item");
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (!items || items.length === 0) return;
        focusIndex = Math.min(focusIndex + 1, items.length - 1);
        items.forEach((it, i) => it.style.background = i === focusIndex ? "#eef6ff" : "");
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!items || items.length === 0) return;
        focusIndex = Math.max(focusIndex - 1, 0);
        items.forEach((it, i) => it.style.background = i === focusIndex ? "#eef6ff" : "");
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        if (focusIndex >= 0 && items && items[focusIndex]) {
          const chosen = items[focusIndex];
          input.value = chosen.textContent;
          input.dataset.lookupId = chosen.dataset.id;
          dropdown.style.display = "none";
          dropdown.dataset.open = "false";
          saveLookupEdit(tr, level, record, field, input.dataset.lookupId, input.value, td);
        } else if (input.dataset.lookupId) {
          saveLookupEdit(tr, level, record, field, input.dataset.lookupId, input.value, td);
        } else {
          // no selection -> try to pick first result
          if (currentResults.length) {
            input.value = currentResults[0].display;
            input.dataset.lookupId = currentResults[0].id;
            dropdown.style.display = "none";
            dropdown.dataset.open = "false";
            saveLookupEdit(tr, level, record, field, input.dataset.lookupId, input.value, td);
          } else {
            alert("Please select a lookup record from the dropdown.");
          }
        }
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        dropdown.style.display = "none";
        dropdown.dataset.open = "false";
        cancelEdit(tr, level, record, field, td);
      }
    });

    // avoid bubbling to document click while interacting with dropdown
    dropdown.addEventListener("click", (ev) => {
      ev.stopPropagation();
    });

    // focus input
    setTimeout(()=> input.focus(), 0);
    return;
  }

  // Default: simple input for text or number
  input = document.createElement("input");
  input.type = field.type === "number" ? "number" : "text";
  input.value = record[field.key] ?? "";
  input.className = "crm-editbox";
  input.onkeydown = (ev) => {
    if (ev.key === "Enter") saveEdit(tr, level, record, field, input, td);
    if (ev.key === "Escape") cancelEdit(tr, level, record, field, td);
  };
  td.appendChild(input);
  setTimeout(()=>input.focus(), 0);
}
