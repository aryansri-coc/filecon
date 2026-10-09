const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function createSamplePdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 in points
  const { width, height } = page.getSize();

  // Draw some vector shapes
  page.drawRectangle({
    x: 50,
    y: height - 150,
    width: width - 100,
    height: 80,
    color: rgb(0.06, 0.72, 0.50), // Corel green
  });

  page.drawCircle({
    x: 100,
    y: height - 110,
    size: 25,
    color: rgb(0.02, 0.71, 0.83), // Cyan
  });

  page.drawText('SAMPLE VECTOR ARTWORK FOR CORELDRAW', {
    x: 140,
    y: height - 115,
    size: 14,
    color: rgb(1, 1, 1),
  });

  page.drawText('This PDF was generated to verify CorelFlow PDF-to-CDR conversion.', {
    x: 50,
    y: height - 200,
    size: 12,
    color: rgb(0.2, 0.2, 0.2),
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('sample_design.pdf', pdfBytes);
  console.log('Sample PDF created: sample_design.pdf');
}

createSamplePdf();
