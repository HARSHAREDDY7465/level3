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
