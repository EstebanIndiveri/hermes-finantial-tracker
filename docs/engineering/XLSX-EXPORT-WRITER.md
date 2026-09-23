# XLSX export writer

`lib/export/generate.ts` writes the XLSX download with ExcelJS. This replaces the
unmaintained `xlsx@0.18.5` runtime package while preserving the three existing
worksheets, their order and names, headers, values, and text/number cell types.
The export route keeps the same MIME type, attachment filename, and CSV path.

ExcelJS 4.4.0 currently declares `uuid@8.3.2`; npm audit flags that transitive
UUID version. The lockfile scopes an override to ExcelJS and resolves
`uuid@11.1.1`, whose `v4()` API used by ExcelJS remains compatible in this path.
The export tests generate and reload a workbook after the override and assert
sheet names, values, cell types, and formula-like merchant text remains a string
cell. A separate test inspects ZIP/OOXML directly, independent of the ExcelJS
reader, to verify sheet order, serialized values and numeric/text cell types,
and absence of a formula node for formula-like user text. Recheck this override whenever ExcelJS changes: it crosses an upstream
major-version range and must not be widened or applied globally without tests.

The workbook library's documented buffer API is asynchronous, so the export
route awaits generation before constructing the same binary response.

References:

- [ExcelJS repository and README](https://github.com/exceljs/exceljs)
- [ExcelJS npm package](https://www.npmjs.com/package/exceljs)
