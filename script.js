Uncaught (in promise) Error: Save failed: - {"error":{"code":"0x80048d19","message":"Error identified in Payload provided by the user for Entity :'', For more information on this error please follow this help link https://go.microsoft.com/fwlink/?linkid=2195293 ----> InnerException : Microsoft.OData.ODataException: An undeclared property 'niq_referencingquote' which only has property annotations in the payload but no property value was found in the payload. In OData, only declared navigation properties and declared named streams can be represented as properties without values.\r\n at Microsoft.OData.JsonLight.ODataJsonLightResourceDeserializer.ReadUndeclaredProperty(IODataJsonLightReaderResourceState resourceState, String propertyName, Boolean propertyWithValue)\r\n at Microsoft.OData.JsonLight.ODataJsonLightResourceDeserializer.ReadPropertyWithoutValue(IODataJsonLightReaderResourceState resourceState, String propertyName)\r\n at Microsoft.OData.JsonLight.ODataJsonLightResourceDeserializer.<>c__DisplayClass9_0.<ReadResourceContent>b__0(PropertyParsingResult propertyParsingResult, String propertyName)\r\n at Microsoft.OData.JsonLight.ODataJsonLightDeserializer.ProcessProperty(PropertyAndAnnotationCollector propertyAndAnnotationCollector, Func`2 readPropertyAnnotationValue, Action`2 handleProperty)\r\n at


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
      displayFields: ["name","quotenumber"]
    } 
  }
