/**
 * 無圧縮（store方式）のZIPライター。外部ライブラリを使わない。
 * .xlsx は中身がZIPなので、これで組み立てられる。
 * Excel / LibreOffice は無圧縮エントリをそのまま読める。
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function strToU8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

interface Entry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/** ファイル名 -> 中身 の組から ZIP バイト列を作る */
export function zipStore(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files);
  const entries: Entry[] = [];

  // 固定のタイムスタンプ（1980-01-01 00:00:00）
  const DOS_TIME = 0;
  const DOS_DATE = 33;   // (1980-1980)<<9 | 1<<5 | 1

  let localSize = 0;
  for (const name of names) {
    const nameBytes = strToU8(name);
    localSize += 30 + nameBytes.length + files[name].length;
  }
  let centralSize = 0;
  for (const name of names) centralSize += 46 + strToU8(name).length;

  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;

  // --- ローカルファイルヘッダ + データ ---
  for (const name of names) {
    const nameBytes = strToU8(name);
    const data = files[name];
    const crc = crc32(data);
    entries.push({ nameBytes, data, crc, offset: p });

    view.setUint32(p, 0x04034b50, true); p += 4;   // signature
    view.setUint16(p, 20, true); p += 2;           // version needed
    view.setUint16(p, 0x0800, true); p += 2;       // flags (UTF-8 filename)
    view.setUint16(p, 0, true); p += 2;            // method = store
    view.setUint16(p, DOS_TIME, true); p += 2;
    view.setUint16(p, DOS_DATE, true); p += 2;
    view.setUint32(p, crc, true); p += 4;
    view.setUint32(p, data.length, true); p += 4;  // compressed size
    view.setUint32(p, data.length, true); p += 4;  // uncompressed size
    view.setUint16(p, nameBytes.length, true); p += 2;
    view.setUint16(p, 0, true); p += 2;            // extra length
    out.set(nameBytes, p); p += nameBytes.length;
    out.set(data, p); p += data.length;
  }

  // --- セントラルディレクトリ ---
  const cdOffset = p;
  for (const e of entries) {
    view.setUint32(p, 0x02014b50, true); p += 4;
    view.setUint16(p, 20, true); p += 2;           // version made by
    view.setUint16(p, 20, true); p += 2;           // version needed
    view.setUint16(p, 0x0800, true); p += 2;
    view.setUint16(p, 0, true); p += 2;
    view.setUint16(p, DOS_TIME, true); p += 2;
    view.setUint16(p, DOS_DATE, true); p += 2;
    view.setUint32(p, e.crc, true); p += 4;
    view.setUint32(p, e.data.length, true); p += 4;
    view.setUint32(p, e.data.length, true); p += 4;
    view.setUint16(p, e.nameBytes.length, true); p += 2;
    view.setUint16(p, 0, true); p += 2;            // extra
    view.setUint16(p, 0, true); p += 2;            // comment
    view.setUint16(p, 0, true); p += 2;            // disk number start
    view.setUint16(p, 0, true); p += 2;            // internal attrs
    view.setUint32(p, 0, true); p += 4;            // external attrs
    view.setUint32(p, e.offset, true); p += 4;     // local header offset
    out.set(e.nameBytes, p); p += e.nameBytes.length;
  }

  // --- End of central directory ---
  view.setUint32(p, 0x06054b50, true); p += 4;
  view.setUint16(p, 0, true); p += 2;              // disk number
  view.setUint16(p, 0, true); p += 2;              // disk with CD
  view.setUint16(p, entries.length, true); p += 2;
  view.setUint16(p, entries.length, true); p += 2;
  view.setUint32(p, p - cdOffset - 18 + 0, true); p += 4;  // CD size（下で補正）
  view.setUint32(p, cdOffset, true); p += 4;
  view.setUint16(p, 0, true); p += 2;              // comment length

  // CDサイズを正確に書き直す
  new DataView(out.buffer).setUint32(localSize + centralSize + 12, centralSize, true);

  return out;
}
