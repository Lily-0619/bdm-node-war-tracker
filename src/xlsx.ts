/**
 * 依存の少ない .xlsx ライター（OOXMLを直接組み立てて zip する）。
 * Workers 上で動かすため、Node専用ライブラリは使わない。
 */
import { strToU8, zipStore } from "./zip";

export const S = {
  DEFAULT: 0,
  HEADER: 1,
  DAY: 2,
  CELL: 3,
  CENTER: 4,
  INPUT: 5,
  RIGHT: 6,
  HEAT1: 7,
  HEAT2: 8,
  HEAT3: 9,
  HEAT4: 10,
  HEAT5: 11,
  TITLE: 12,
  NOTE: 13,
  // 曜日ごとの行の色分け（全記録シート用）
  WD_MON: 14,
  WD_THU: 15,
  WD_FRI: 16,
  WD_SAT: 17,
  WD_SUN: 18,
  WD_MON_C: 19,
  WD_THU_C: 20,
  WD_FRI_C: 21,
  WD_SAT_C: 22,
  WD_SUN_C: 23,
} as const;

export const HEAT_STYLE: Record<string, number> = {
  heat0: S.RIGHT, heat1: S.HEAT1, heat2: S.HEAT2,
  heat3: S.HEAT3, heat4: S.HEAT4, heat5: S.HEAT5,
};

/** 曜日キー（mon/thu/fri/sat/sun）→ 通常セルのスタイル */
export const WEEKDAY_STYLE: Record<string, number> = {
  mon: S.WD_MON, thu: S.WD_THU, fri: S.WD_FRI, sat: S.WD_SAT, sun: S.WD_SUN,
};
/** 曜日キー → 中央寄せセルのスタイル */
export const WEEKDAY_STYLE_CENTER: Record<string, number> = {
  mon: S.WD_MON_C, thu: S.WD_THU_C, fri: S.WD_FRI_C, sat: S.WD_SAT_C, sun: S.WD_SUN_C,
};

export type CellValue = string | number | null | undefined;
export interface Cell { v: CellValue; s?: number; }
export interface Sheet {
  name: string;
  rows: (Cell | CellValue)[][];
  cols?: number[];
  freezeRows?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

function colLetter(n: number): string {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

const FONT = (extra = "") => `<font><sz val="9"/><name val="Meiryo"/>${extra}</font>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8">
${FONT()}
${FONT("<b/>")}
<font><sz val="10"/><name val="Meiryo"/><b/><color rgb="FFFFFFFF"/></font>
<font><sz val="12"/><name val="Meiryo"/><b/></font>
${FONT('<color rgb="FF666666"/>')}
${FONT('<color rgb="FF7A3B0D"/>')}
${FONT('<color rgb="FF5C2A05"/>')}
${FONT('<color rgb="FFFFFFFF"/>')}
</fonts>
<fills count="15">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDFE6DF"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF217346"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8D8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF2E6"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBDFC4"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7C396"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF0A06A"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE57A3C"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE3F2FD"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3E0"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8F5E9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4EC"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3E5F5"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right><top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="24">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="5" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="6" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="7" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="14" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="11" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="12" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="13" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="14" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sheet: Sheet): string {
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  ];

  if (sheet.freezeRows) {
    parts.push(
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}"` +
      ` topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` +
      `</sheetView></sheetViews>`);
  }

  if (sheet.cols?.length) {
    parts.push("<cols>");
    sheet.cols.forEach((w, i) => {
      parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`);
    });
    parts.push("</cols>");
  }

  parts.push("<sheetData>");
  sheet.rows.forEach((row, ri) => {
    const r = ri + 1;
    const cells: string[] = [];
    row.forEach((raw, ci) => {
      const cell: Cell = (raw !== null && typeof raw === "object") ? raw as Cell : { v: raw as CellValue };
      const ref = `${colLetter(ci + 1)}${r}`;
      const s = cell.s ?? S.DEFAULT;
      if (cell.v === null || cell.v === undefined || cell.v === "") {
        if (s !== S.DEFAULT) cells.push(`<c r="${ref}" s="${s}"/>`);
        return;
      }
      if (typeof cell.v === "number" && Number.isFinite(cell.v)) {
        cells.push(`<c r="${ref}" s="${s}"><v>${cell.v}</v></c>`);
      } else {
        cells.push(
          `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">` +
          `${esc(String(cell.v))}</t></is></c>`);
      }
    });
    if (cells.length) parts.push(`<row r="${r}">${cells.join("")}</row>`);
  });
  parts.push("</sheetData></worksheet>");
  return parts.join("");
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  const n = sheets.length;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets.map((s, i) =>
      `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join("") +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(workbookRels),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });

  return zipStore(files);
}
