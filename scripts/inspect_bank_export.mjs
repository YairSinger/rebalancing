import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/yair/Downloads/התיק שלי_1424_23062026.xlsx";
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 16,
  tableMaxCellChars: 120,
});

console.log(overview.ndjson);
