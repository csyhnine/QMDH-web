import { zipSync, strToU8 } from "fflate";
import { addDays, cell, LEDGER_COLUMNS, staffAffiliation, TEAM_ROLES, type PlanningProject } from "./planning";
import { CLASSIFICATIONS, classifiedSummary, financialSummary, MONEY_FIELDS, weeklyWorkload, type ReportingData } from "./reporting";

type Cell = string | number | null;
type Sheet = { name: string; rows: Cell[][]; merges?: string[]; widths?: number[]; headerRows?: number[] };
const xml = (text: unknown) => String(text ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
function column(index: number): string { return index < 26 ? String.fromCharCode(65 + index) : column(Math.floor(index / 26) - 1) + column(index % 26); }
function worksheet(sheet: Sheet) {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${Math.max(...(sheet.headerRows || [1]))}" topLeftCell="A${Math.max(...(sheet.headerRows || [1])) + 1}" state="frozen"/></sheetView></sheetViews><cols>${(sheet.widths || [24]).map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheet.rows.map((row, r) => `<row r="${r + 1}" ht="${r === 0 ? 32 : 30}" customHeight="1">${row.map((value, c) => `<c r="${column(c)}${r + 1}" s="${r === 0 ? 1 : sheet.headerRows?.includes(r + 1) ? 2 : 0}"${typeof value === "number" ? `><v>${value}</v>` : ` t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is>`}</c>`).join("")}</row>`).join("")}</sheetData>${sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
export function reportWorkbook(data: ReportingData, start: string, days: number) {
  const title = `【${data.unit}】${data.year}年度项目信息一览表`;
  const last = column(LEDGER_COLUMNS.length - 1);
  const header = LEDGER_COLUMNS.map(([key, label], i) => i === 2 ? "项目组成员" : i > 2 && i < 8 ? "" : label);
  const subheader = LEDGER_COLUMNS.map(([key], i) => i >= 2 && i < 8 ? TEAM_ROLES[i - 2][1] : "");
  const projectRows = data.projects.filter(p => !p.deleted).map(p => LEDGER_COLUMNS.map(([key]) => {
    if (MONEY_FIELDS.some(([k]) => k === key)) {
      const value = p[key as keyof PlanningProject];
      // Excel stores 15 significant digits. Preserve larger exact amounts as text.
      return value == null ? null : String(value).replace(/\D/g, "").length <= 15 ? Number(value) : String(value);
    }
    return cell(p, key, data.staff, start);
  }));
  const finance = financialSummary(data.projects), week = weeklyWorkload(data, start, days);
  const sheets: Sheet[] = [
    { name: "年度项目台账", headerRows: [3, 4], widths: LEDGER_COLUMNS.map(([key]) => key === "name" || key.endsWith("work") || key === "notes" ? 36 : 19),
      rows: [[title], [`表格编制：${data.report.compiler || "待填写"}　数据更新：${data.report.data_as_of || "待填写"}　范围：本院本年度未删除项目（含归档）；下周安排窗口 ${addDays(start, 7)}—${addDays(start, 11)}`], header, subheader, ...projectRows],
      merges: [`A1:${last}1`, `A2:${last}2`, "C3:H3", ...LEDGER_COLUMNS.flatMap((_, i) => i >= 2 && i < 8 ? [] : [`${column(i)}3:${column(i)}4`])] },
    { name: "经营及分类统计", widths: [25, 32, 20, 20, 20, 20, 20], merges: ["A1:G1", "A2:G2"], headerRows: [3], rows: [
      [`${data.unit} · ${data.year}年度经营统计`], ["金额单位：万元；空白不作零；签约率只含已确认状态，回款率只含设计费与回款均已填写项目。"],
      ["指标", "金额 / 比例", "已填写项目", "待填写项目"],
      ...MONEY_FIELDS.map(([key, label]) => [label, finance.totals[key].known ? finance.totals[key].amount : "—", finance.totals[key].known, finance.totals[key].missing]),
      ["回款率", finance.collectionRate || "—", finance.collectionKnown, finance.collectionMissing],
      ["签约率", finance.signingRate || "—", finance.signed + finance.unsigned, finance.contractUnknown],
      ["未删除项目数", finance.total, "其中归档", finance.archived],
      ...CLASSIFICATIONS.flatMap(([key, label]) => [[`${label}分类`, "项目数", ...MONEY_FIELDS.map(([, name]) => name), "签约待确认"], ...classifiedSummary(data.projects, key).map(row => [row.label, row.total, ...MONEY_FIELDS.map(([field]) => row.totals[field].known ? row.totals[field].amount : "—"), row.contractUnknown])]),
    ] },
    { name: "人员周工作量", widths: [20, 26, ...Array(14).fill(15)], merges: ["A1:P1", "A2:P2"], headerRows: [3], rows: [
      [`【${data.unit}】每周工作量安排一览表`], [`${start}—${week.end}；管理分工按本年度在管项目；本周参与按排期去重；排名在各归属内比较。`],
      ["组员", "人员归属", ...TEAM_ROLES.map(([, label]) => label), "A级项目", "B级项目", "C级项目", "D级项目", "未定级", "配合其他分院", "工作子项总计", "同类排名"],
      ...(["internal", "external", "unknown"] as const).flatMap(kind => {
        const rows = week.rows.filter(r => (r.person.employment_type || "unknown") === kind);
        return rows.length ? [[kind === "internal" ? "QMDH 内部" : kind === "external" ? "外包人员" : "归属待确认"], ...rows.map(r => [r.person.name, staffAffiliation(r.person), ...TEAM_ROLES.map(([key]) => r.roles[key]), ...r.grades, r.unclassified, r.cooperation, r.total, r.rank ?? "—"])] : [];
      }),
      ["口径", "总计=前五项管理/驻场分工+本周去重项目数；参与人员列不重复加总。项目数及排名不等于实际工时。"],
      ["数据待完善", `未排期 ${week.unscheduled} 项；手工周安排 ${week.manual} 项（未转排期的不计周参与项目数）。`],
    ] },
  ];
  const files: Record<string, Uint8Array> = {};
  const put = (name: string, content: string) => { files[name] = strToU8(content); };
  put("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  put("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  put("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  put("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  put("xl/styles.xml", `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="12"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((sheet, i) => put(`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet)));
  return zipSync(files);
}
