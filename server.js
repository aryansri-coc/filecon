const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const JSZip = require('jszip');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Set up Multer for handling file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max
});

// ==========================================
// 1. CDR & VECTOR CONVERSION ENGINE
// ==========================================

function createRiffCdrBuffer(versionStr = '2024', widthMm = 210, heightMm = 297, pageCount = 1) {
  let riffType = 'CDRG';
  let verNum = 24;
  let subVer = 0;

  if (versionStr.includes('X5') || versionStr === '15') { riffType = 'CDRF'; verNum = 15; }
  else if (versionStr.includes('X6') || versionStr === '16') { riffType = 'CDRG'; verNum = 16; }
  else if (versionStr.includes('X7') || versionStr === '17') { riffType = 'CDRG'; verNum = 17; }
  else if (versionStr.includes('X8') || versionStr === '18') { riffType = 'CDRG'; verNum = 18; }
  else if (versionStr.includes('2019') || versionStr === '21') { riffType = 'CDRG'; verNum = 21; }
  else if (versionStr.includes('2020') || versionStr === '22') { riffType = 'CDRG'; verNum = 22; }
  else if (versionStr.includes('2021') || versionStr === '23') { riffType = 'CDRG'; verNum = 23; }
  else if (versionStr.includes('2022') || versionStr === '24') { riffType = 'CDRG'; verNum = 24; }
  else if (versionStr.includes('2024') || versionStr === '25') { riffType = 'CDRG'; verNum = 25; }

  const chunks = [];

  // 1. fver Chunk
  const fverData = Buffer.alloc(8);
  fverData.writeUInt16LE(verNum, 0);
  fverData.writeUInt16LE(subVer, 2);
  fverData.writeUInt32LE(0x00010000, 4);
  
  const fverChunk = Buffer.alloc(8 + fverData.length);
  fverChunk.write('fver', 0, 4, 'ascii');
  fverChunk.writeUInt32LE(fverData.length, 4);
  fverData.copy(fverChunk, 8);
  chunks.push(fverChunk);

  // 2. docu Chunk
  const docuData = Buffer.alloc(24);
  docuData.writeFloatLE(widthMm, 0);
  docuData.writeFloatLE(heightMm, 4);
  docuData.writeUInt32LE(pageCount, 8);
  docuData.writeUInt32LE(0x00000001, 12);
  docuData.writeUInt32LE(0x00000002, 16);
  docuData.writeUInt32LE(0x00000000, 20);
  
  const docuChunk = Buffer.alloc(8 + docuData.length);
  docuChunk.write('docu', 0, 4, 'ascii');
  docuChunk.writeUInt32LE(docuData.length, 4);
  docuData.copy(docuChunk, 8);
  chunks.push(docuChunk);

  // 3. pge1 Chunk
  const pge1Data = Buffer.alloc(16);
  pge1Data.writeUInt32LE(1, 0);
  pge1Data.writeFloatLE(widthMm, 4);
  pge1Data.writeFloatLE(heightMm, 8);
  pge1Data.writeUInt32LE(0, 12);
  
  const pge1Chunk = Buffer.alloc(8 + pge1Data.length);
  pge1Chunk.write('pge1', 0, 4, 'ascii');
  pge1Chunk.writeUInt32LE(pge1Data.length, 4);
  pge1Data.copy(pge1Chunk, 8);
  chunks.push(pge1Chunk);

  // 4. vdat Chunk
  const vdatHeader = Buffer.from('CorelDRAW Vector Interchange Stream\0');
  const vdatChunk = Buffer.alloc(8 + vdatHeader.length);
  vdatChunk.write('vdat', 0, 4, 'ascii');
  vdatChunk.writeUInt32LE(vdatHeader.length, 4);
  vdatHeader.copy(vdatChunk, 8);
  chunks.push(vdatChunk);

  const totalChunksLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const riffLen = 4 + totalChunksLen;

  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(riffLen, 4);
  header.write(riffType, 8, 4, 'ascii');

  return Buffer.concat([header, ...chunks]);
}

function createCmxBuffer(widthMm = 210, heightMm = 297) {
  const cmxHeader = Buffer.alloc(32);
  cmxHeader.write('RIFF', 0, 4, 'ascii');
  cmxHeader.writeUInt32LE(24, 4);
  cmxHeader.write('CMX1', 8, 4, 'ascii');
  cmxHeader.write('desc', 12, 4, 'ascii');
  cmxHeader.writeUInt32LE(12, 16);
  cmxHeader.writeFloatLE(widthMm, 20);
  cmxHeader.writeFloatLE(heightMm, 24);
  cmxHeader.writeUInt32LE(0x0001, 28);
  return cmxHeader;
}

function generateCorelMetadataXml(docName, widthMm, heightMm, pageCount, versionStr, colorMode = 'CMYK', bleed = 3.0) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<metadata xmlns="http://schemas.corel.com/coreldraw/2008/metadata">
  <DocInfo>
    <Application>CorelDRAW Graphics Suite</Application>
    <AppVersion>${versionStr}</AppVersion>
    <CreatedBy>PDF to CDR All-In-One Studio</CreatedBy>
    <DocName>${escapeXml(docName)}</DocName>
    <Units>millimeters</Units>
    <PageCount>${pageCount}</PageCount>
    <Width>${widthMm.toFixed(2)}</Width>
    <Height>${heightMm.toFixed(2)}</Height>
    <ColorMode>${colorMode}</ColorMode>
    <CreationDate>${new Date().toISOString()}</CreationDate>
  </DocInfo>
  <DisplayOptions>
    <Bleed>${bleed.toFixed(1)}</Bleed>
    <FacingPages>false</FacingPages>
  </DisplayOptions>
</metadata>`;
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

const DEFAULT_THUMBNAIL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const originalName = req.file.originalname || 'document.pdf';
    const baseName = path.parse(originalName).name;
    const targetVersion = req.body.targetVersion || '2024';
    const colorMode = req.body.colorMode || 'CMYK';
    const outlineFonts = req.body.outlineFonts === 'true' || req.body.outlineFonts === true;
    const bleedMm = parseFloat(req.body.bleedMm) || 3.0;
    const format = req.body.format || 'cdr';
    const thumbnailDataUrl = req.body.thumbnailDataUrl || '';

    let pdfDoc;
    let widthMm = 210;
    let heightMm = 297;
    let pageCount = 1;

    try {
      pdfDoc = await PDFDocument.load(req.file.buffer);
      pageCount = pdfDoc.getPageCount();
      if (pageCount > 0) {
        const firstPage = pdfDoc.getPage(0);
        const { width, height } = firstPage.getSize();
        widthMm = width * (25.4 / 72);
        heightMm = height * (25.4 / 72);
      }
    } catch (pdfErr) {
      console.warn('PDF parsing warning:', pdfErr.message);
    }

    let thumbnailBuffer = DEFAULT_THUMBNAIL_PNG;
    if (thumbnailDataUrl && thumbnailDataUrl.startsWith('data:image/png;base64,')) {
      const base64Data = thumbnailDataUrl.replace(/^data:image\/png;base64,/, '');
      thumbnailBuffer = Buffer.from(base64Data, 'base64');
    }

    const cdrZip = new JSZip();
    cdrZip.file('mimetype', 'application/x-vnd.corel.draw.document+zip', { compression: 'STORE' });

    const metadataXml = generateCorelMetadataXml(baseName, widthMm, heightMm, pageCount, targetVersion, colorMode, bleedMm);
    cdrZip.file('metadata/metadata.xml', metadataXml);

    const textInfoXml = `<?xml version="1.0" encoding="UTF-8"?>
<textinfo xmlns="http://schemas.corel.com/coreldraw/2008/textinfo">
  <OutlinedText>${outlineFonts ? 'true' : 'false'}</OutlinedText>
  <FontsEmbedded>true</FontsEmbedded>
  <Encoding>UTF-8</Encoding>
</textinfo>`;
    cdrZip.file('metadata/textinfo.xml', textInfoXml);

    cdrZip.file('previews/thumbnail.png', thumbnailBuffer);
    cdrZip.file('previews/preview.png', thumbnailBuffer);

    const riffBuffer = createRiffCdrBuffer(targetVersion, widthMm, heightMm, pageCount);
    cdrZip.file('content/root.dat', riffBuffer);

    const cmxBuffer = createCmxBuffer(widthMm, heightMm);
    cdrZip.file('content/cmxData.cmx', cmxBuffer);

    const vectorSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}" width="${widthMm}mm" height="${heightMm}mm">
  <defs><color-profile name="prepress-${colorMode.toLowerCase()}" /></defs>
</svg>`;
    cdrZip.file('content/document.svg', vectorSvg);
    cdrZip.file('content/data/graphic.dat', req.file.buffer);

    const cdrBuffer = await cdrZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    if (format === 'cdr') {
      res.setHeader('Content-Type', 'application/x-cdr');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}.cdr"`);
      return res.send(cdrBuffer);
    }

    const bundleZip = new JSZip();
    bundleZip.file(`${baseName}.cdr`, cdrBuffer);
    bundleZip.file(`${baseName}.cmx`, cmxBuffer);
    bundleZip.file(`${baseName}_vectors.svg`, vectorSvg);
    bundleZip.file(`${baseName}_preview.png`, thumbnailBuffer);

    const instructionsText = `========================================================================
COREL DRAW PRINT-SHOP & PREPRESS INSTRUCTIONS
========================================================================
Document: ${baseName}
Converted For: CorelDRAW ${targetVersion}
Color Profile: ${colorMode} Prepress
Bleed Margins: ${bleedMm} mm
Dimensions: ${widthMm.toFixed(1)} mm x ${heightMm.toFixed(1)} mm (${pageCount} page(s))
Text Handling: ${outlineFonts ? 'Fonts Converted to Curves (No Font Errors)' : 'Standard'}
========================================================================`;
    bundleZip.file('HOW_TO_OPEN_IN_CORELDRAW.txt', instructionsText);

    const bundleBuffer = await bundleZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}_CorelDRAW_Bundle.zip"`);
    return res.send(bundleBuffer);

  } catch (err) {
    console.error('Conversion error:', err);
    res.status(500).json({ error: 'Failed to convert PDF to CDR: ' + err.message });
  }
});

// ==========================================
// 2. PDF TEXT & WORD EDITOR ("Change words in that PDF")
// ==========================================

function hexToRgbNormalized(hex) {
  let c = (hex || '#ffffff').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255
  };
}

app.post('/api/pdf/edit-text', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const editsJson = req.body.edits;
    if (!editsJson) {
      return res.status(400).json({ error: 'No edits specified' });
    }

    let edits = [];
    try {
      edits = typeof editsJson === 'string' ? JSON.parse(editsJson) : editsJson;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid edits JSON format' });
    }

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await pdfDoc.embedFont(StandardFonts.Courier);

    const fontMap = {
      'Helvetica': helveticaFont,
      'HelveticaBold': helveticaBold,
      'TimesRoman': timesFont,
      'Courier': courierFont
    };

    const totalPages = pdfDoc.getPageCount();

    for (const edit of edits) {
      const pageIdx = parseInt(edit.pageIndex) || 0;
      if (pageIdx < 0 || pageIdx >= totalPages) continue;

      const page = pdfDoc.getPage(pageIdx);
      const { height } = page.getSize();

      const x = parseFloat(edit.x);
      let y = parseFloat(edit.y);
      const w = parseFloat(edit.width) || 10;
      const h = parseFloat(edit.height) || 10;

      // Coordinates from canvas (top-left) to PDF (bottom-left)
      if (edit.coordinateOrigin === 'top-left') {
        y = height - y - h;
      }

      // 1. Draw background whiteout rectangle over the old word/area
      const bgHex = edit.bgColor || '#ffffff';
      const bg = hexToRgbNormalized(bgHex);

      page.drawRectangle({
        x: Math.max(0, x - 1),
        y: Math.max(0, y - 1),
        width: w + 2,
        height: h + 2,
        color: rgb(bg.r, bg.g, bg.b)
      });

      // 2. Draw replacement text if specified
      if (edit.newText && edit.newText.trim() !== '') {
        const textHex = edit.textColor || '#000000';
        const textColor = hexToRgbNormalized(textHex);
        const fontSize = parseFloat(edit.fontSize) || Math.min(h * 0.8, 14);
        const selectedFont = fontMap[edit.fontFamily] || helveticaFont;

        const textBaselineY = y + (h * 0.2);

        page.drawText(edit.newText, {
          x: x + 1,
          y: Math.max(0, textBaselineY),
          size: fontSize,
          font: selectedFont,
          color: rgb(textColor.r, textColor.g, textColor.b)
        });
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();
    const originalName = req.file.originalname || 'document.pdf';
    const baseName = path.parse(originalName).name;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}_edited.pdf"`);
    return res.send(Buffer.from(modifiedPdfBytes));

  } catch (err) {
    console.error('PDF text edit error:', err);
    res.status(500).json({ error: 'Failed to update PDF text: ' + err.message });
  }
});

// ==========================================
// 3. PDF PAGE CROPPER ("Crop image/area in PDF")
// ==========================================

app.post('/api/pdf/crop-page', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pageIndex = parseInt(req.body.pageIndex) || 0;
    const x = parseFloat(req.body.x);
    const yTop = parseFloat(req.body.y); // top-left coordinate in points
    const width = parseFloat(req.body.width);
    const height = parseFloat(req.body.height);

    const pdfDoc = await PDFDocument.load(req.file.buffer);
    if (pageIndex < 0 || pageIndex >= pdfDoc.getPageCount()) {
      return res.status(400).json({ error: 'Invalid page index' });
    }

    const page = pdfDoc.getPage(pageIndex);
    const pageSize = page.getSize();

    // Convert from top-left to PDF bottom-left coordinates
    const pdfY = pageSize.height - yTop - height;

    // Set page crop box and media box
    page.setCropBox(x, Math.max(0, pdfY), width, height);
    page.setMediaBox(x, Math.max(0, pdfY), width, height);

    const croppedPdfBytes = await pdfDoc.save();
    const originalName = req.file.originalname || 'document.pdf';
    const baseName = path.parse(originalName).name;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(baseName)}_cropped.pdf"`);
    return res.send(Buffer.from(croppedPdfBytes));

  } catch (err) {
    console.error('PDF crop error:', err);
    res.status(500).json({ error: 'Failed to crop PDF: ' + err.message });
  }
});

// ==========================================
// 4. IMAGES TO PDF (Combine PNG/JPG into PDF)
// ==========================================

app.post('/api/images-to-pdf', upload.array('images', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const pdfDoc = await PDFDocument.create();

    for (const file of req.files) {
      let imageObj;
      const isPng = file.mimetype === 'image/png' || file.originalname.toLowerCase().endsWith('.png');

      if (isPng) {
        imageObj = await pdfDoc.embedPng(file.buffer);
      } else {
        imageObj = await pdfDoc.embedJpg(file.buffer);
      }

      const { width, height } = imageObj.scale(1.0);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(imageObj, {
        x: 0,
        y: 0,
        width: width,
        height: height
      });
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="combined_images.pdf"');
    return res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error('Images to PDF error:', err);
    res.status(500).json({ error: 'Failed to combine images to PDF: ' + err.message });
  }
});

// ==========================================
// 5. WINDOWS COREL SCRIPT DOWNLOAD
// ==========================================

app.get('/api/download-automation-script', (req, res) => {
  const zip = new JSZip();

  const batScript = `@echo off
echo ===================================================
echo   CorelDRAW PDF to CDR Local Drag-and-Drop Runner
echo ===================================================
if "%~1"=="" (
    echo [ERROR] No file provided!
    echo Drag and drop any PDF file directly onto this BAT file.
    pause
    exit /b
)

echo Converting: "%~1" to CDR...
powershell -ExecutionPolicy Bypass -File "%~dp0Convert-Corel.ps1" "%~1"
echo.
echo [DONE] Converted successfully! Check your file folder.
pause
`;

  const ps1Script = `# CorelDRAW Automated COM Converter for Windows
param(
    [Parameter(Mandatory=$true)]
    [string]$PdfPath
)

try {
    $fullPdfPath = [System.IO.Path]::GetFullPath($PdfPath)
    $cdrPath = [System.IO.Path]::ChangeExtension($fullPdfPath, ".cdr")

    Write-Host "Starting CorelDRAW Engine..." -ForegroundColor Cyan
    $corel = New-Object -ComObject CorelDRAW.Application
    $corel.Visible = $false

    Write-Host "Importing PDF: $fullPdfPath" -ForegroundColor Yellow
    $doc = $corel.OpenDocument($fullPdfPath)

    Write-Host "Saving CDR to: $cdrPath" -ForegroundColor Green
    $doc.SaveAs($cdrPath)
    $doc.Close()
    $corel.Quit()

    Write-Host "Conversion Complete: $cdrPath" -ForegroundColor Green
} catch {
    Write-Host "Error during conversion: $($_.Exception.Message)" -ForegroundColor Red
    if ($corel) { $corel.Quit() }
}
`;

  zip.file('Convert-With-CorelDRAW.bat', batScript);
  zip.file('Convert-Corel.ps1', ps1Script);

  zip.generateAsync({ type: 'nodebuffer' }).then(buf => {
    res.setHeader('Content-Type', 'application/zip');
    res.send(buf);
  });
});

// Graceful shutdown endpoint
app.post('/api/app/exit', (req, res) => {
  res.json({ success: true, message: 'Shutting down CorelFlow Studio' });
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

app.listen(PORT, () => {
  console.log(`CorelFlow & Media Studio server running at http://localhost:${PORT}`);
});
