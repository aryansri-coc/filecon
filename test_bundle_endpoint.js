const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const JSZip = require('jszip');

async function testBundle() {
  const form = new FormData();
  form.append('file', fs.createReadStream('sample_design.pdf'));
  form.append('targetVersion', 'X7');
  form.append('colorMode', 'CMYK');
  form.append('outlineFonts', 'true');
  form.append('bleedMm', '3.0');
  form.append('format', 'bundle');

  const res = await axios.post('http://localhost:3000/api/convert', form, {
    headers: form.getHeaders(),
    responseType: 'arraybuffer'
  });

  console.log('Response Status:', res.status);
  console.log('Content-Type:', res.headers['content-type']);
  console.log('Bundle File Size:', res.data.length, 'bytes');

  const zip = await JSZip.loadAsync(res.data);
  console.log('Files in Bundle ZIP:', Object.keys(zip.files));
  const instructions = await zip.file('HOW_TO_OPEN_IN_CORELDRAW.txt').async('string');
  console.log('Instructions snippet:\n', instructions.slice(0, 300));
}

testBundle().catch(err => console.error(err));
