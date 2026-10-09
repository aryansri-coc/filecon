const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

function createRiffCdrBuffer(versionStr = '2024', widthMm = 210, heightMm = 297) {
  // Map version string to FourCC / version number
  let riffType = 'CDRG';
  let verNum = 24;
  if (versionStr.includes('X5')) { riffType = 'CDRF'; verNum = 15; }
  else if (versionStr.includes('X6')) { riffType = 'CDRG'; verNum = 16; }
  else if (versionStr.includes('X7')) { riffType = 'CDRG'; verNum = 17; }
  else if (versionStr.includes('X8')) { riffType = 'CDRG'; verNum = 18; }
  else if (versionStr.includes('2019')) { riffType = 'CDRG'; verNum = 21; }
  else if (versionStr.includes('2020')) { riffType = 'CDRG'; verNum = 22; }
  else if (versionStr.includes('2022')) { riffType = 'CDRG'; verNum = 24; }
  else if (versionStr.includes('2024')) { riffType = 'CDRG'; verNum = 25; }

  // Create minimal valid RIFF CDR container
  // RIFF <len> CDRG [chunks...]
  const chunks = [];

  // Chunk 1: fver (format version)
  const fverData = Buffer.alloc(8);
  fverData.writeUInt16LE(verNum, 0); // major
  fverData.writeUInt16LE(0, 2);      // minor
  fverData.writeUInt32LE(0x00010000, 4); // build
  
  const fverChunk = Buffer.alloc(8 + fverData.length);
  fverChunk.write('fver', 0, 4, 'ascii');
  fverChunk.writeUInt32LE(fverData.length, 4);
  fverData.copy(fverChunk, 8);
  chunks.push(fverChunk);

  // Chunk 2: docu (document properties)
  const docuData = Buffer.alloc(16);
  docuData.writeFloatLE(widthMm, 0);   // page width mm
  docuData.writeFloatLE(heightMm, 4);  // page height mm
  docuData.writeUInt32LE(1, 8);        // 1 page
  docuData.writeUInt32LE(0, 12);       // flags
  
  const docuChunk = Buffer.alloc(8 + docuData.length);
  docuChunk.write('docu', 0, 4, 'ascii');
  docuChunk.writeUInt32LE(docuData.length, 4);
  docuData.copy(docuChunk, 8);
  chunks.push(docuChunk);

  // Combine chunks
  const totalChunksLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const riffLen = 4 + totalChunksLen; // 'CDRG' (4) + chunks

  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(riffLen, 4);
  header.write(riffType, 8, 4, 'ascii');

  return Buffer.concat([header, ...chunks]);
}

async function testPackage() {
  const zip = new JSZip();
  // mimetype MUST be uncompressed at the start of the archive
  zip.file('mimetype', 'application/x-vnd.corel.draw.document+zip', { compression: 'STORE' });
  
  const metadataXml = `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://schemas.corel.com/coreldraw/2008/metadata">
  <DocInfo>
    <Application>CorelDRAW</Application>
    <AppVersion>24.0</AppVersion>
    <CreatedBy>PDF to CDR High-Speed Converter</CreatedBy>
    <DocName>test.cdr</DocName>
    <Units>millimeters</Units>
    <PageCount>1</PageCount>
    <Width>210.0</Width>
    <Height>297.0</Height>
    <ColorMode>CMYK</ColorMode>
  </DocInfo>
</metadata>`;

  zip.file('metadata/metadata.xml', metadataXml);
  zip.file('content/root.dat', createRiffCdrBuffer('2024', 210, 297));

  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  console.log('Generated CDR package size:', buf.length, 'bytes');
}

testPackage();
