const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const JSZip = require('jszip');

async function testConverter() {
  const form = new FormData();
  form.append('file', fs.createReadStream('sample_design.pdf'));
  form.append('targetVersion', '2024');
  form.append('colorMode', 'CMYK');
  form.append('outlineFonts', 'true');
  form.append('bleedMm', '3.0');
  form.append('format', 'cdr');

  console.log('Sending test request to http://localhost:3000/api/convert ...');
  const res = await axios.post('http://localhost:3000/api/convert', form, {
    headers: form.getHeaders(),
    responseType: 'arraybuffer'
  });

  console.log('Response Status:', res.status);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Content-Disposition:', res.headers['content-disposition']);
  console.log('CDR File Size:', res.data.length, 'bytes');

  // Verify internal zip structure
  const zip = await JSZip.loadAsync(res.data);
  const files = Object.keys(zip.files);
  console.log('Files inside generated .CDR archive:', files);

  // Check mimetype
  const mimeContent = await zip.file('mimetype').async('string');
  console.log('Mimetype contents:', mimeContent);

  // Check metadata
  const metaContent = await zip.file('metadata/metadata.xml').async('string');
  console.log('Metadata snippet:', metaContent.slice(0, 180));

  // Check root.dat header
  const rootBuf = await zip.file('content/root.dat').async('nodebuffer');
  console.log('RIFF root.dat FourCC:', rootBuf.slice(0, 4).toString('ascii'), 'Type:', rootBuf.slice(8, 12).toString('ascii'));

  fs.writeFileSync('output_test.cdr', res.data);
  console.log('Saved output_test.cdr successfully!');
}

testConverter().catch(err => {
  console.error('Test error:', err.message);
});
