if (typeof SubGridEvents === "undefined") {
    SubGridEvents = {
        __namespace: true,
    };
}
//---------- Editable Code Starts from here ------------------------
SubGridEvents.Events = {
  ValidateGrid: function (field, value) {
    if(!this.ValidateEstimatedRevenue(field, value)){
        return false;
    }
    else{
        return true;
    }
  },

  ValidateEstimatedRevenue: function(field, value){
    if(field.key == "estimatedvalue" && Number(value)>100000){
        //   alert("Estimated Revenue Cannot be More than 1 Lakh!");
        //success, error, warrning, info, question ------ icon types
        this.CustomAlert('error', 'Error!', 'Estimated Revenue Cannot be More than 1 Lakh!');
        return false;
    }
    return true;
  },

  CustomAlert: function(Icon, title, message){
    alertbox.render({
        alertIcon: Icon,
        title: title,
        message: message,
        btnTitle: 'Ok',
        themeColor: '#006efeff',
        border: true
    });
  }
}

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
  { key: "niq_ishostopportunity", label: "Is Host?", editable: true, type:"boolean" },
  { key: "description", label: "Description", editable: true},

];
const quoteColumns = [
  { key: "name", label: "Quote Name", editable: true, required: true },
  { key: "statuscode", label: "Status", editable: false, type: "Choice" }
];
const quoteLineColumns = [
  { key: "productname", label: "Product", editable: false, required: true },
  { key: "quantity", label: "Quantity", editable: true, type: "number", required: true },
  { key: "extendedamount", label: "Total Amount", editable: false, type: "number", required: true }
];
const quoteCharacteristicColumns = [
  { key: "niq_name", label: "Feature", editable: true, required: true },
  { key: "niq_type", label: "Type", editable: true, required: true, type: "choice"},
  { key: "niq_char2", label: "Type2", editable: true, required: true, type: "choice" },
  {
  key: "_niq_referencingquote_value",
  label: "Referencing Quote",
  editable: true,
  type: "lookup",
  lookup: {
    entitySet: "quotes",
    key: "quoteid",
    nameField: "name",
    displayFields: ["name", "quotenumber"],
    navigationProperty: "niq_referencingquote"
    }
  }
];

// ----------- HIERARCHY CONFIG WITH FILTER FUNCTION AND MULTIPLE SELECTION -----------
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
//-------------- Editable Code Ends here --------------------

// ------------- Driver Code starts from here -------------------

baseUrl = window.parent.Xrm.Page.context.getClientUrl();

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
  let filter;
  if (typeof cfg.filter === "function") {
    filter = cfg.filter({ currentRecordId });
  } else {
    filter = cfg.filter || "";
  }
  if (text && text.trim()) {
    const safeText = text.replace(/'/g, "''");
    filter += (filter ? " and " : "") + `contains(name,'${safeText}')`;
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

    // Display formatted values from Dataverse (this includes OptionSet and lookups)
    if (record[`${field.key}@OData.Community.Display.V1.FormattedValue`]) {
      val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`];
    }

    // If still a boolean primitive, convert to Yes/No
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

function validateField(field, value) {
  if (field.required && (value === null || value === undefined || value === "")) return "Required";
  if (field.type === "number" && value !== "" && isNaN(Number(value))) return "Invalid number";
  return null;
}

async function saveEdit(tr, level, record, field, input, td) {
  let value = input.value;
  if (field.type === "boolean") {
    // we store booleans as true/false
    value = (value === "true" || value === true);
  }
  const err = validateField(field, value);
  if (err) {
    input.classList.add("crm-validation-error");
    input.setCustomValidity(err);
    input.reportValidity();
    return;
  }
  
  if(field.type === "lookup"){
    const selectedId = input && input.dataset ? input.dataset.selectedId: null;
    if(selectedId){
        await saveLookupEdit(level, record,field,selectedId, td);
    }
    else{
        alert("please select a record from the dropdown");
        editingCell = null;
        renderGrid();
    }
    return;
  }

  // calling ValidateGrid
  if(!SubGridEvents.Events.ValidateGrid(field,value)){
    editingCell = null;
    renderGrid();
    return;
  }

  const update = {};
  update[field.key] = field.type === "number" ? Number(value) : value;
  try {
    const cfg = hierarchyConfig[level];
    await patchData(cfg.entitySet, record[cfg.key], update);
  } catch (e) {
    alert("Save failed: " + e.message);
  }
  editingCell = null;
  renderGrid();
}

function cancelEdit(tr, level, record, field, td) {
  editingCell = null;
  renderGrid();
}

// --- Dynamic OptionSet Metadata Fetcher ---
const optionSetCache = {};

async function fetchOptionSetMetadata(entityName, fieldName, fieldType) {
    const key = `${entityName}_${fieldName}_${fieldType}`;
    if (optionSetCache[key]) return optionSetCache[key];

    if (fieldType === "boolean") {
        // Use Xrm.Utility for Boolean fields
        try {
            const metadata = await Xrm.Utility.getEntityMetadata(entityName, [fieldName]);
            const attr = metadata.Attributes.get(fieldName);
            if (attr && attr.OptionSet) {
                const trueOption = attr.OptionSet.TrueOption;
                const falseOption = attr.OptionSet.FalseOption;
                const options = [
                    { value: true, label: trueOption.Label.LocalizedLabels[0].Label },
                    { value: false, label: falseOption.Label.LocalizedLabels[0].Label }
                ];
                optionSetCache[key] = options;
                return options;
            }
        } catch (e) {
            console.error("Boolean metadata fetch failed:", e);
            return [
                { value: true, label: "Yes" },
                { value: false, label: "No" }
            ];
        }
    }

    if (fieldType === "choice") {
        // still use EntityDefinitions for choice fields
        const url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${fieldName}')/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet`;
        const headers = {
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            "Accept": "application/json",
            "Content-Type": "application/json; charset=utf-8"
        };
        const response = await fetch(url, { method: "GET", headers });
        if (!response.ok) {
            console.error("Choice metadata fetch failed:", await response.text());
            return [];
        }
        const data = await response.json();
        const options = data.OptionSet.Options.map(opt => ({
            value: opt.Value,
            label: opt.Label?.UserLocalizedLabel?.Label || String(opt.Value)
        }));
        optionSetCache[key] = options;
        return options;
    }

    return [];
}

// --- Lookup Search ---
async function searchLookup(entitySet, nameField, displayFields, searchText) {
  if (!searchText || !searchText.trim()) return [];
  const idField = entitySet.slice(0, -1) + "id";
  const selectFields = Array.from(new Set([...(displayFields || [nameField]), idField])).join(",");
  const filter = `contains(${nameField},'${searchText.replace(/'/g, "''")}')`;
  const records = await fetchData(entitySet, selectFields, filter);
  return records.map(r => {
    const display = (displayFields || [nameField]).map(f => r[f] || "").filter(Boolean).join(" - ");
    return { id: r[idField], display };
  });
}

// --- Save Lookup ---
async function saveLookupEdit(level, record, field, lookupId, td) {
  if (!lookupId){
    alert("Select a record from dropdown");
    return;
  } 
  let navProp;
  if(field.lookup && field.lookup.navigationProperty){
    navProp = field.lookup.navigationProperty;
  }else{
    navProp = field.key.replace(/^_/,"").replace(/_value$/,"");

  }
  const sanitizedId = String(lookupId).replace(/['{}]/g,'');
  const update = {};
  update[`${navProp}@odata.bind`] = `/${field.lookup.entitySet}(${sanitizedId})`;
  const cfg = hierarchyConfig[level];
  await patchData(cfg.entitySet, record[cfg.key], update);
  editingCell = null; renderGrid();


    // const navProp = (field.key || "").replace(/^_/, "").replace(/_value$/, "");
    // console.log("navprop",navProp);
    // const sanitizedId = String(lookupId).replace(/['{}]/g,'');
    // const update = {};
    // update[`${navProp}@odata.bind`] = `/${field.lookup.entitySet}(${sanitizedId})`;
    // const cfg = hierarchyConfig[level];
    // await patchData(cfg.entitySet, record[cfg.key], update);
    // editingCell = null; renderGrid();
}

// --- Unified Cell Editor ---
async function startEditCell(tr, level, record, field, td) {
    if (editingCell) return;
    const rid = tr.dataset.rid;
    editingCell = { rid, fieldKey: field.key, originalValue: record[field.key] };
    td.classList.add("edit-cell");
    td.innerHTML = '';

    // Lookup
    if (field.type === "lookup") {
        const input = document.createElement("input");
        input.className = "crm-editbox";
        input.value = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] || "";
        const dropdown = document.createElement("div");
        dropdown.className = "crm-lookup-dropdown";
        td.style.position = "relative";
        td.appendChild(input);
        td.appendChild(dropdown);

        let timeout; let currentResults = [];
        input.addEventListener("input", () => {
            clearTimeout(timeout);
            timeout = setTimeout(async () => {
                currentResults = await searchLookup(field.lookup.entitySet, field.lookup.nameField, field.lookup.displayFields, input.value);
                dropdown.innerHTML = "";
                dropdown.style.display = currentResults.length ? "block" : "none";
                currentResults.forEach(r => {
                    const item = document.createElement("div");
                    item.className = "crm-lookup-item";
                    item.textContent = r.display;
                    item.onclick = () => {
                        input.value = r.display;
                        saveLookupEdit(level, record, field, r.id, td);
                        dropdown.style.display = "none";
                    };
                    dropdown.appendChild(item);
                });
            }, 300);
        });
        input.onkeydown = (ev) => { if (ev.key === "Escape") { editingCell = null; renderGrid(); } };
        input.focus();
        return;
    }

    // Choice / Boolean
    if (field.type === "choice" || field.type === "boolean") {
        const input = document.createElement("select");
        input.className = "crm-editbox";

        const cfg = hierarchyConfig[level];
        const entitySet = cfg.entitySet;
        const entityName = entitySet.slice(0, -1); // crude singularization

        try {
            const options = await fetchOptionSetMetadata(entityName, field.key, field.type);
            options.forEach(opt => {
                const option = document.createElement("option");
                // store option.value as string to keep select.value consistent
                option.value = String(opt.value);
                option.textContent = opt.label;
                // Compare using loose equality to account for string/boolean/number
                if (record[field.key] == opt.value || String(record[field.key]) === String(opt.value)) {
                    option.selected = true;
                }
                input.appendChild(option);
            });
        } catch (e) {
            console.error("Metadata fetch error:", e);
            // fallback to Yes/No for boolean
            if (field.type === "boolean") {
                input.innerHTML = "<option value='true'>Yes</option><option value='false'>No</option>";
                if (record[field.key] === true || record[field.key] === "true") input.value = "true";
                else input.value = "false";
            } else {
                // fallback empty input for choice
                input.innerHTML = "<option value=''>--</option>";
            }
        }

        input.onkeydown = (ev) => {
            if (ev.key === "Enter") saveEdit(tr, level, record, field, input, td);
            if (ev.key === "Escape") cancelEdit(tr, level, record, field, td);
        };
        input.onchange = () => {
          // optional: auto-save on change for selects
        };
        td.appendChild(input);
        setTimeout(() => input.focus(), 0);
        return;
    }

    // Text / Number
    const input = document.createElement("input");
    input.className = "crm-editbox";
    input.type = field.type === "number" ? "number" : "text";
    input.value = record[field.key] ?? "";
    input.onkeydown = async (ev) => {
        if (ev.key === "Enter") {
            // const update = {};
            // update[field.key] = field.type === "number" ? Number(input.value) : input.value;
            // await patchData(hierarchyConfig[level].entitySet, record[hierarchyConfig[level].key], update);
            // editingCell = null; renderGrid();

            await saveEdit(tr, level, record, field, input, td);
        }
        // if (ev.key === "Escape") { editingCell = null; renderGrid(); }
        if(ev.key ==="Escape"){ cancelEdit(tr,level, record, field, td);}
    };
    td.appendChild(input);
    input.focus();
}
