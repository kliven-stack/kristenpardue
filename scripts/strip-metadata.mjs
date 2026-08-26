/**
 * Strip the runaway XMP blocks out of the mirrored JPEGs — losslessly.
 *
 * Some of this site's uploads carry an "extended XMP" chain: twelve consecutive
 * APP1 segments of 65,535 bytes each, which WordPress's resizer copies verbatim
 * into every derivative it generates. The worst case is
 * `2022/03/thumb1-150x150.jpg`: 777,025 bytes on disk, of which the actual
 * entropy-coded image is 3,250 — 99.6% of the file is metadata, on a 150x150
 * thumbnail that appears on twelve pages.
 *
 * This is NOT a re-encode. The scan data is copied through byte for byte, and so
 * are the quantisation and Huffman tables, the JFIF header and the ICC profile —
 * dropping a colour profile would change how the image renders, which is exactly
 * what this must not do. Only the XMP APP1 segments go. Every output is
 * pixel-identical to its input by construction, and `--verify` proves it by
 * decoding both and comparing raw pixels.
 *
 *   node scripts/strip-metadata.mjs [--verify] [--dry]
 *
 * Re-running `npm run media` restores the originals from production, so this is
 * reversible.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const UPLOADS = path.join(ROOT, 'public/wp-content/uploads');
const VERIFY = process.argv.includes('--verify');
const DRY = process.argv.includes('--dry');

/** Markers that carry no image data and can be dropped without touching pixels. */
const APP1 = 0xe1;

/**
 * Rewrite a JPEG without its XMP APP1 segments.
 *
 * Returns null when there is nothing to strip. Walks the marker chain up to the
 * start of scan; everything from SOS onward is copied untouched.
 */
function stripXmp(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const keep = [buf.subarray(0, 2)];
  let i = 2;
  let dropped = 0;
  /** Inside a run of APP1 segments belonging to one XMP packet. */
  let inXmp = false;

  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) return null; // not a well-formed marker chain — leave it alone
    const marker = buf[i + 1];
    if (marker === 0xda) {           // start of scan: the rest is image data
      keep.push(buf.subarray(i));
      break;
    }
    if (marker === 0xd9) { keep.push(buf.subarray(i)); break; }
    const length = buf.readUInt16BE(i + 2);
    const segment = buf.subarray(i, i + 2 + length);

    // XMP identifies itself in the segment's first bytes. EXIF (`Exif\0\0`) shares
    // the APP1 marker and is left alone — it is small, and orientation lives there.
    //
    // The packet in these files is not well-formed extended XMP: it is one huge
    // XMP document chopped across twelve APP1 segments, and only the first carries
    // the `http://ns.adobe.com/xap/1.0/` identifier. The rest are raw continuation
    // bytes (`<rdf:li>uuid:…`) with no identifier at all, so they can only be
    // recognised by the run they belong to — matching on the identifier alone
    // strips one segment out of twelve and leaves 690KB behind.
    const head = segment.subarray(4, 44).toString('latin1');
    const isXmpStart = marker === APP1 && /^http:\/\/ns\.adobe\.com\/x(a|m)p/.test(head);
    // A following APP1 that names no format at all is a continuation of the run.
    const isContinuation = inXmp && marker === APP1 && !/^[A-Za-z][\w./:-]{2,}\0/.test(head);

    if (isXmpStart || isContinuation) {
      inXmp = true;
      dropped += segment.length;
    } else {
      inXmp = false;
      keep.push(segment);
    }

    i += 2 + length;
  }

  return dropped ? { out: Buffer.concat(keep), dropped } : null;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const mb = (n) => (n / 1048576).toFixed(1);
let before = 0;
let after = 0;
let touched = 0;
const changed = [];

for await (const file of walk(UPLOADS)) {
  if (!/\.jpe?g$/i.test(file)) continue;
  const size = (await stat(file)).size;
  const buf = await readFile(file);
  const result = stripXmp(buf);
  before += size;
  if (!result) { after += size; continue; }

  after += result.out.length;
  touched++;
  changed.push([path.relative(ROOT, file), size, result.out.length]);
  if (!DRY) await writeFile(file, result.out);
}

for (const [name, was, now] of changed.sort((a, b) => (b[1] - b[2]) - (a[1] - a[2])).slice(0, 10)) {
  console.log(`  ${String(Math.round(was / 1024)).padStart(6)} KB → ${String(Math.round(now / 1024)).padStart(5)} KB  ${name}`);
}
console.log(`\n${touched} files stripped${DRY ? ' (dry run)' : ''}: ${mb(before)} MB → ${mb(after)} MB`);

if (VERIFY && !DRY) {
  // Prove the claim rather than assert it: decode each rewritten file and its
  // original from production, and compare raw pixels.
  const sharp = (await import('sharp')).default;
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
  let checked = 0;
  for (const [rel] of changed) {
    const url = 'https://kristenpardue.com/' + rel.replace(/^public\//, '');
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) { console.log(`  ? could not refetch ${rel}`); continue; }
    const original = Buffer.from(await res.arrayBuffer());
    const [a, b] = await Promise.all([
      sharp(original).raw().toBuffer(),
      sharp(await readFile(path.join(ROOT, rel))).raw().toBuffer(),
    ]);
    if (!a.equals(b)) { console.log(`  PIXEL MISMATCH ${rel}`); process.exitCode = 1; }
    else checked++;
  }
  console.log(`${checked}/${changed.length} verified pixel-identical to production`);
}
