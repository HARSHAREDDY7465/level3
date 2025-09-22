// -- Replace with your Dataverse org URL --
const baseUrl = "https://orgbc876bfc.crm8.dynamics.com"; // Development URL

const opportunityColumns = [
  { key: "name", label: "Opportunity Name", editable: true, required: true },
  { key: "_parentcontactid_value", label: "Customer", editable: true, lookup: "contacts" },
  { key: "estimatedvalue", label: "Revenue", editable: true, type: "number" },
  { key: "niq_ishostopportunity", label: "Is Host?", editable: false }
];

const quoteColumns = [
  { key: "name", label: "Quote Name", editable: true, required: true },
  { key: "statecode", label: "Status", editable: true }
];

const quoteLineColumns = [
  { key: "productname", label: "Product", editable: true, required: true },
  { key: "quantity", label: "Quantity", editable: true, type: "number", required: true },
  { key: "extendedamount", label: "Total Amount", editable: false, type: "number", required: true }
];

const quoteCharacteristicColumns = [
  { key: "niq_name", label: "Feature", editable: true, required: true },
  { key: "niq_type", label: "Type", editable: true, type: "choice" },
  { key: "niq_char2", label: "Type2", editable: true, type: "choice" }
];

const hierarchyConfig = [
  {
    entitySet: "opportunities",
    key: "opportunityid",
    columns: opportunityColumns,
    child: 1,
    title: "Child Opportunities",
    multiple: true,
    filter: ({ currentRecordId }) => `niq_ishostopportunity eq false and _niq_originalopportunity_value eq ${formatGuid(currentRecordId)}`
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

// --- Dataverse helpers ---
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
  const response = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(updateObj) });
  if (!response.ok) throw new Error("Save failed: " + response.statusText);
}

// --- State ---
let currentRecordId = null;
let expandedRows = {};
let editingCell = null;
let currentRows = [];
let currentFilter = "";
let selectedRows = {};

function formatGuid(id) {
  if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) return `'${id}'`;
  return id;
}

function rowId(level, id) { return `${level}-${id}`; }

document.addEventListener("DOMContentLoaded", () => {
  try { currentRecordId = window.parent.Xrm.Page.data.entity.getId().replace(/[{}]/g, ''); }
  catch { currentRecordId = new URLSearchParams(window.location.search).get("id"); }
  setupFilterForm();
  renderGrid();
});

// --- Filter form ---
function setupFilterForm() {
  const form = document.getElementById("filterForm");
  const input = document.getElementById("filterInput");
  const clearBtn = document.getElementById("clearFilterBtn");
  form.addEventListener("submit", e => { e.preventDefault(); applyFilter(input.value); });
  clearBtn.addEventListener("click", () => { input.value = ""; applyFilter(""); });
}

function applyFilter(text) {
  const cfg = hierarchyConfig[0];
  let filter = typeof cfg.filter === "function" ? cfg.filter({ currentRecordId }) : cfg.filter || "";
  if (text && text.trim()) filter += (filter ? " and " : "") + `contains(tolower(name),'${text.toLowerCase()}')`;
  currentFilter = filter;
  expandedRows = {};
  editingCell = null;
  renderGrid();
}

// --- Rendering ---
async function renderGrid(level = 0, parentRecord = null) {
  const cfg = hierarchyConfig[level];
  if (level === 0 && cfg.title) document.getElementById("crmGridTitle").textContent = cfg.title;
  renderGridHeader(cfg);

  const tbody = document.getElementById("crmGridBody");
  if (level === 0) { tbody.innerHTML = ""; currentRows = []; }

  try {
    let filter = "";
    if (level === 0) filter = typeof cfg.filter === "function" ? cfg.filter({ currentRecordId }) : cfg.filter || "";
    else if (parentRecord) filter = `${cfg.parentField} eq ${formatGuid(parentRecord[hierarchyConfig[level-1].key])}`;

    if (currentFilter && currentFilter !== filter) filter = currentFilter;

    const allCols = cfg.columns.map(f => f.key).concat([cfg.key]);
    if (cfg.parentField) allCols.push(cfg.parentField);

    const records = await fetchData(cfg.entitySet, Array.from(new Set(allCols)).join(","), filter);
    for (const record of records) await renderRow(tbody, level, record);
    if (level === 0) document.getElementById("crmGridRowCount").textContent = `${currentRows.length} row${currentRows.length !== 1 ? "s" : ""}`;
  } catch (e) { if (level === 0) document.getElementById("crmGridError").textContent = e.message; }
}

function renderGridHeader(cfg) {
  const headRow = document.getElementById("crmGridHeadRow");
  headRow.innerHTML = `<th style="width:32px"></th><th style="width:24px"></th>`;
  cfg.columns.forEach(col => headRow.innerHTML += `<th>${col.label}</th>`);
}

async function renderRow(tbody, level, record) {
  const cfg = hierarchyConfig[level];
  const id = record[cfg.key];
  const rid = rowId(level, id);
  currentRows.push({ level, id });

  const tr = document.createElement("tr");
  tr.dataset.level = level + 1; tr.dataset.rid = rid;

  // Selection
  const tdSelect = document.createElement("td");
  const cfgMultiple = cfg.multiple ?? false;
  if (!selectedRows[level]) selectedRows[level] = new Set();
  const isChecked = selectedRows[level].has(id);
  tdSelect.innerHTML = `<input type="${cfgMultiple ? "checkbox" : "radio"}" name="select-row-level-${level}" ${isChecked ? "checked" : ""} />`;
  tdSelect.firstChild.onclick = (e) => { e.stopPropagation(); handleRowSelect(level, id, cfgMultiple); };
  tr.appendChild(tdSelect);

  // Expand icon
  const tdIcon = document.createElement("td");
  tdIcon.style.paddingLeft = `calc(13px + ${30 * level}px)`;
  if (cfg.child !== undefined) {
    const icon = document.createElement("i");
    icon.className = "crm-icon fa-solid fa-chevron-right";
    if (expandedRows[rid]) { icon.classList.replace("fa-chevron-right","fa-chevron-down"); }
    icon.onclick = async (e) => { e.stopPropagation(); expandedRows[rid] = !expandedRows[rid]; await renderGrid(); };
    tdIcon.appendChild(icon);
  } else tdIcon.innerHTML = '<span class="crm-icon crm-icon-empty fa-solid fa-square"></span>';
  tr.appendChild(tdIcon);

  // Data cells
  for (const field of cfg.columns) {
    const td = document.createElement("td");
    td.classList.add("crm-data-cell");

    let val = record[`${field.key}@OData.Community.Display.V1.FormattedValue`] ?? record[field.key];
    if (typeof val === "boolean") val = val ? "Yes" : "No";
    td.textContent = val ?? "";

    if (field.editable) td.onclick = () => startEditCell(tr, level, record, field, td);

    // Active edit
    if (editingCell && editingCell.rid === rid && editingCell.fieldKey === field.key) {
      td.classList.add("edit-cell"); td.innerHTML = '';
      startEditCell(tr, level, record, field, td);
    }

    tr.appendChild(td);
  }

  tbody.appendChild(tr);

  // Render children
  if (cfg.child !== undefined && expandedRows[rid]) {
    const childCfg = hierarchyConfig[level+1];
    renderChildGridHeader(tbody, childCfg, level);
    const childFilter = `${childCfg.parentField} eq ${formatGuid(id)}`;
    const childRecords = await fetchData(childCfg.entitySet, Array.from(new Set(childCfg.columns.map(f => f.key).concat([childCfg.key, childCfg.parentField]))).join(","), childFilter);
    for (const child of childRecords) await renderRow(tbody, level+1, child);
  }
}

function renderChildGridHeader(tbody, childCfg, level) {
  const tr = document.createElement("tr");
  tr.classList.add("child-grid-header"); tr.dataset.level = level + 2;
  const thIcon = document.createElement("th"); thIcon.style.paddingLeft = `calc(13px + ${30*(level+1)}px)`; thIcon.textContent = ""; tr.appendChild(thIcon);
  const thSelect = document.createElement("th"); thSelect.textContent = ""; tr.appendChild(thSelect);
  childCfg.columns.forEach(col => { const th = document.createElement("th"); th.textContent = col.label; tr.appendChild(th); });
  tbody.appendChild(tr);
}

function handleRowSelect(level, id, multiple) {
  if (!selectedRows[level]) selectedRows[level] = new Set();
  if (multiple) selectedRows[level].has(id) ? selectedRows[level].delete(id) : selectedRows[level].add(id);
  else selectedRows[level] = new Set([id]);
  renderGrid();
}

// --- Dynamic cell editor (handles lookup, choice, boolean, number, text) ---
const optionSetCache = {};
async function fetchOptionSetMetadata(entityName, fieldName, fieldType) {
  const key = `${entityName}_${fieldName}`;
  if (optionSetCache[key]) return optionSetCache[key];

  let url = `${baseUrl}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes(LogicalName='${fieldName}')`;
  url += fieldType === "choice" ? "/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=LogicalName&$expand=OptionSet"
         : fieldType === "boolean" ? "/Microsoft.Dynamics.CRM.BooleanAttributeMetadata?$select=LogicalName&$expand=OptionSet" : "";

  if (!url) return [];
  const headers = { "OData-MaxVersion":"4.0","OData-Version":"4.0","Accept":"application/json","Content-Type":"application/json; charset=utf-8" };
  const response = await fetch(url,{ method:"GET", headers });
  if(!response.ok) throw new Error("Failed to fetch metadata");
  const data = await response.json();

  if(fieldType==="choice") optionSetCache[key]=data.OptionSet.Options.map(o=>({value:o.Value,label:o.Label.UserLocalizedLabel?.Label||o.Value}));
  else if(fieldType==="boolean") optionSetCache[key]=[{value:true,label:"Yes"},{value:false,label:"No"}];
  return optionSetCache[key];
}

// --- Start editing cell ---
async function startEditCell(tr, level, record, field, td) {
  if (editingCell) return;
  const rid = tr.dataset.rid;
  editingCell={rid,fieldKey:field.key,originalValue:record[field.key]};
  td.classList.add("edit-cell"); td.innerHTML="";

  let input;
  if (field.lookup) {
    input=document.createElement("input");
    input.type="text"; input.className="crm-editbox"; input.value="";
    const dropdown=document.createElement("div"); dropdown.className="lookup-dropdown"; dropdown.style.position="absolute"; dropdown.style.border="1px solid #ccc"; dropdown.style.background="#fff"; dropdown.style.maxHeight="200px"; dropdown.style.overflowY="auto"; td.appendChild(input); td.appendChild(dropdown);

    let timeout;
    input.addEventListener("input", async e=>{
      clearTimeout(timeout);
      const q=input.value; if(!q){ dropdown.innerHTML=""; return; }
      timeout=setTimeout(async ()=>{
        const results=await fetchData(field.lookup,"fullname,contactid",`contains(tolower(fullname),'${q.toLowerCase()}')`);
        dropdown.innerHTML="";
        results.forEach(r=>{
          const div=document.createElement("div"); div.className="lookup-item"; div.textContent=r.fullname;
          div.onclick=()=>{ record[field.key]=r.contactid; input.value=r.fullname; dropdown.innerHTML=""; saveEdit(tr,level,record,field,input,td); };
          dropdown.appendChild(div);
        });
      },300);
    });
    input.onkeydown=e=>{ if(e.key==="Escape") cancelEdit(tr,level,record,field,td); };
  } else if(field.type==="choice"||field.type==="boolean"){
    input=document.createElement("select"); input.className="crm-editbox";
    const entitySet=hierarchyConfig[level].entitySet; const entityName=entitySet.slice(0,-1);
    try{ const options=await fetchOptionSetMetadata(entityName,field.key,field.type); options.forEach(opt=>{ const o=document.createElement("option"); o.value=opt.value; o.textContent=opt.label; if(record[field.key]==opt.value)o.selected=true; input.appendChild(o); }); }
    catch(e){ input=document.createElement("input"); input.type="text"; input.value=record[field.key]??""; }
    input.onkeydown=e=>{ if(e.key==="Enter") saveEdit(tr,level,record,field,input,td); if(e.key==="Escape") cancelEdit(tr,level,record,field,td); };
    td.appendChild(input); setTimeout(()=>input.focus(),0); return;
  } else {
    input=document.createElement("input"); input.type=field.type==="number"?"number":"text"; input.value=record[field.key]??""; input.className="crm-editbox";
    input.onkeydown=e=>{ if(e.key==="Enter") saveEdit(tr,level,record,field,input,td); if(e.key==="Escape") cancelEdit(tr,level,record,field,td); };
    td.appendChild(input); setTimeout(()=>input.focus(),0); return;
  }
  setTimeout(()=>input.focus(),0);
}

// --- Save edited value ---
async function saveEdit(tr,level,record,field,input,td){
  const value=field.lookup ? record[field.key] : field.type==="number" ? Number(input.value) : input.value;
  const update={};
  if(field.lookup) update[`${field.key}@odata.bind`] = `/${field.lookup}(${value})`;
  else update[field.key] = value;
  try{ await patchData(hierarchyConfig[level].entitySet,record[hierarchyConfig[level].key],update); }
  catch(e){ alert("Save failed: "+e.message); }
  editingCell=null; renderGrid();
}

// --- Cancel editing ---
function cancelEdit(tr,level,record,field,td){ editingCell=null; renderGrid(); }
