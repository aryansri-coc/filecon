/**
 * CorelFlow Studio - All-in-One Controller
 * Handles PDF to CDR, Format Conversions, Cropping, and Text/Word Editing
 */

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  // Global Shared PDF State
  let globalPdfFile = null;
  let globalPdfDoc = null;
  let globalCurrentPage = 1;
  let globalTotalPages = 1;
  let globalPageWidthMm = 210;
  let globalPageHeightMm = 297;
  let previewThumbnailUrl = '';

  // Theme Switcher Controller
  const btnThemePicker = document.getElementById('btnThemePicker');
  const themeDropdownMenu = document.getElementById('themeDropdownMenu');
  const currentThemeLabel = document.getElementById('currentThemeLabel');
  const themeOptionBtns = document.querySelectorAll('.theme-option-btn');

  const themeLabels = {
    'indigo-violet': 'Violet',
    'royal-sapphire': 'Sapphire',
    'cyber-emerald': 'Emerald',
    'obsidian-amber': 'Amber'
  };

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('corelflow_theme', themeName);
    if (currentThemeLabel) {
      currentThemeLabel.textContent = themeLabels[themeName] || 'Violet';
    }
    themeOptionBtns.forEach(btn => {
      if (btn.getAttribute('data-theme') === themeName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Load saved theme or default to Deep Indigo & Electric Violet
  const savedTheme = localStorage.getItem('corelflow_theme') || 'indigo-violet';
  applyTheme(savedTheme);

  if (btnThemePicker && themeDropdownMenu) {
    btnThemePicker.addEventListener('click', (e) => {
      e.stopPropagation();
      themeDropdownMenu.classList.toggle('show');
    });

    themeOptionBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedTheme = btn.getAttribute('data-theme');
        applyTheme(selectedTheme);
        themeDropdownMenu.classList.remove('show');
        showToast(`Theme changed to ${themeLabels[selectedTheme]}!`, 'success');
      });
    });

    document.addEventListener('click', (e) => {
      if (!btnThemePicker.contains(e.target) && !themeDropdownMenu.contains(e.target)) {
        themeDropdownMenu.classList.remove('show');
      }
    });
  }

  // Tab switching
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      navTabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) targetContent.classList.add('active');

      // Sync state into active tab if file exists
      if (globalPdfFile) {
        if (tabId === 'image-cropper') initCropperWithCurrentPdf();
        if (tabId === 'text-editor') initTextEditorWithCurrentPdf();
      }
    });
  });

  // =========================================================================
  // 1. PDF TO CDR ENGINE
  // =========================================================================
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowse = document.getElementById('btnBrowse');
  const fileInfoCard = document.getElementById('fileInfoCard');
  const btnRemoveFile = document.getElementById('btnRemoveFile');
  const fileNameDisplay = document.getElementById('fileNameDisplay');
  const fileSizeDisplay = document.getElementById('fileSizeDisplay');
  const filePagesDisplay = document.getElementById('filePagesDisplay');
  const fileDimensionsDisplay = document.getElementById('fileDimensionsDisplay');

  const targetVersionSelect = document.getElementById('targetVersion');
  const colorModeSelect = document.getElementById('colorMode');
  const outlineFontsToggle = document.getElementById('outlineFontsToggle');
  const bleedToggle = document.getElementById('bleedToggle');
  const btnConvert = document.getElementById('btnConvert');

  const progressBox = document.getElementById('progressBox');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressStatusText = document.getElementById('progressStatusText');

  const downloadCard = document.getElementById('downloadCard');
  const downloadSummary = document.getElementById('downloadSummary');
  const btnDownloadCdr = document.getElementById('btnDownloadCdr');
  const btnDownloadBundle = document.getElementById('btnDownloadBundle');

  const previewPlaceholder = document.getElementById('previewPlaceholder');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const pdfCanvas = document.getElementById('pdfCanvas');
  const previewNavBar = document.getElementById('previewNavBar');
  const pageIndicator = document.getElementById('pageIndicator');
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  
  const specDimensions = document.getElementById('specDimensions');
  const specFormat = document.getElementById('specFormat');
  const specColor = document.getElementById('specColor');
  const specCompatibility = document.getElementById('specCompatibility');

  let lastConvertedBlob = null;
  let lastConvertedFilename = '';
  let lastBundleBlob = null;

  // File triggers
  btnBrowse.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadMainPdf(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); });
  });
  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      loadMainPdf(e.dataTransfer.files[0]);
    }
  });

  btnRemoveFile.addEventListener('click', () => {
    globalPdfFile = null;
    globalPdfDoc = null;
    fileInput.value = '';
    fileInfoCard.style.display = 'none';
    dropzone.style.display = 'block';
    btnConvert.disabled = true;
    progressBox.style.display = 'none';
    downloadCard.style.display = 'none';
    previewPlaceholder.style.display = 'flex';
    canvasWrapper.style.display = 'none';
    previewNavBar.style.display = 'none';
    specDimensions.textContent = '—';
    specFormat.textContent = '—';
  });

  async function loadMainPdf(file) {
    if (!file || (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf')) {
      showToast('Please upload a valid PDF document.', 'error');
      return;
    }

    globalPdfFile = file;
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = formatBytes(file.size);

    dropzone.style.display = 'none';
    fileInfoCard.style.display = 'block';
    downloadCard.style.display = 'none';
    progressBox.style.display = 'none';
    btnConvert.disabled = false;

    // Enable buttons on format converter tab
    const btnCur = document.getElementById('btnExportCurrentPageImg');
    const btnAll = document.getElementById('btnExportAllPagesZip');
    if (btnCur) btnCur.disabled = false;
    if (btnAll) btnAll.disabled = false;

    const pdfToImageFileName = document.getElementById('pdfToImageFileName');
    if (pdfToImageFileName) pdfToImageFileName.textContent = file.name;

    showToast(`Loaded: ${file.name}`, 'success');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      globalPdfDoc = await loadingTask.promise;
      globalTotalPages = globalPdfDoc.numPages;
      globalCurrentPage = 1;

      filePagesDisplay.textContent = `${globalTotalPages} Page${globalTotalPages > 1 ? 's' : ''}`;
      pageIndicator.textContent = `Page ${globalCurrentPage} of ${globalTotalPages}`;

      btnPrevPage.disabled = true;
      btnNextPage.disabled = globalTotalPages <= 1;
      previewNavBar.style.display = globalTotalPages > 1 ? 'flex' : 'none';

      await renderPreviewPage(globalCurrentPage);
    } catch (err) {
      console.error('PDF preview error:', err);
      showToast('Preview error: ' + err.message, 'error');
    }
  }

  async function renderPreviewPage(pageNum) {
    if (!globalPdfDoc) return;
    const page = await globalPdfDoc.getPage(pageNum);
    const viewportUnscaled = page.getViewport({ scale: 1.0 });

    globalPageWidthMm = viewportUnscaled.width * (25.4 / 72);
    globalPageHeightMm = viewportUnscaled.height * (25.4 / 72);

    const dimText = `${globalPageWidthMm.toFixed(1)} × ${globalPageHeightMm.toFixed(1)} mm`;
    fileDimensionsDisplay.textContent = dimText;
    specDimensions.textContent = dimText;
    specFormat.textContent = detectStandardPaperFormat(globalPageWidthMm, globalPageHeightMm);

    const scale = Math.min(2.0, Math.max(1.0, 800 / viewportUnscaled.width));
    const viewport = page.getViewport({ scale: scale });

    const ctx = pdfCanvas.getContext('2d');
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    previewThumbnailUrl = pdfCanvas.toDataURL('image/png');

    previewPlaceholder.style.display = 'none';
    canvasWrapper.style.display = 'flex';
    previewNavBar.style.display = 'flex';
  }

  btnPrevPage.addEventListener('click', async () => {
    if (globalCurrentPage > 1) {
      globalCurrentPage--;
      pageIndicator.textContent = `Page ${globalCurrentPage} of ${globalTotalPages}`;
      btnPrevPage.disabled = globalCurrentPage === 1;
      btnNextPage.disabled = globalCurrentPage === globalTotalPages;
      await renderPreviewPage(globalCurrentPage);
    }
  });

  btnNextPage.addEventListener('click', async () => {
    if (globalCurrentPage < globalTotalPages) {
      globalCurrentPage++;
      pageIndicator.textContent = `Page ${globalCurrentPage} of ${globalTotalPages}`;
      btnPrevPage.disabled = globalCurrentPage === 1;
      btnNextPage.disabled = globalCurrentPage === globalTotalPages;
      await renderPreviewPage(globalCurrentPage);
    }
  });

  btnConvert.addEventListener('click', async () => {
    if (!globalPdfFile) return;

    const selectedFormat = document.querySelector('input[name="outputFormat"]:checked')?.value || 'cdr';
    const targetVersion = targetVersionSelect.value;
    const colorMode = colorModeSelect.value;
    const outlineFonts = outlineFontsToggle.checked;
    const bleedMm = bleedToggle.checked ? 3.0 : 0.0;

    btnConvert.disabled = true;
    downloadCard.style.display = 'none';
    progressBox.style.display = 'block';

    updateProgress(20, 'Analyzing vector paths...');
    await sleep(200);
    updateProgress(50, 'Encoding CorelDRAW RIFF container...');
    await sleep(200);
    updateProgress(80, 'Generating Corel XML metadata...');

    try {
      const formData = new FormData();
      formData.append('file', globalPdfFile);
      formData.append('targetVersion', targetVersion);
      formData.append('colorMode', colorMode);
      formData.append('outlineFonts', outlineFonts);
      formData.append('bleedMm', bleedMm);
      formData.append('format', selectedFormat);
      formData.append('thumbnailDataUrl', previewThumbnailUrl);

      const response = await fetch('/api/convert', { method: 'POST', body: formData });
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      updateProgress(100, 'Done!');
      const blob = await response.blob();
      const baseName = globalPdfFile.name.replace(/\.[^/.]+$/, "");

      if (selectedFormat === 'cdr') {
        lastConvertedBlob = blob;
        lastConvertedFilename = `${baseName}.cdr`;
      } else {
        lastBundleBlob = blob;
        lastConvertedFilename = `${baseName}_CorelDRAW_Bundle.zip`;
      }

      progressBox.style.display = 'none';
      downloadCard.style.display = 'block';
      downloadSummary.textContent = `Converted "${globalPdfFile.name}" into CorelDRAW ${targetVersion} (${formatBytes(blob.size)}).`;

      triggerDownload(blob, lastConvertedFilename);
      showToast('Conversion complete! File downloaded.', 'success');
    } catch (err) {
      progressBox.style.display = 'none';
      btnConvert.disabled = false;
      showToast('Conversion failed: ' + err.message, 'error');
    }
  });

  function updateProgress(percent, text) {
    progressPercent.textContent = `${percent}%`;
    progressBarFill.style.width = `${percent}%`;
    progressStatusText.textContent = text;
  }

  btnDownloadCdr.addEventListener('click', () => {
    if (lastConvertedBlob) triggerDownload(lastConvertedBlob, lastConvertedFilename);
  });
  btnDownloadBundle.addEventListener('click', async () => {
    if (lastBundleBlob) {
      triggerDownload(lastBundleBlob, `${globalPdfFile.name.replace(/\.[^/.]+$/, "")}_Bundle.zip`);
    } else {
      showToast('Generating bundle...', 'info');
      const formData = new FormData();
      formData.append('file', globalPdfFile);
      formData.append('targetVersion', targetVersionSelect.value);
      formData.append('format', 'bundle');
      const res = await fetch('/api/convert', { method: 'POST', body: formData });
      const b = await res.blob();
      triggerDownload(b, `${globalPdfFile.name.replace(/\.[^/.]+$/, "")}_Bundle.zip`);
    }
  });

  // =========================================================================
  // 2. UNIVERSAL FORMAT CONVERTER
  // =========================================================================
  const pdfToImageDropzone = document.getElementById('pdfToImageDropzone');
  const pdfToImageInput = document.getElementById('pdfToImageInput');
  const btnExportCurrentPageImg = document.getElementById('btnExportCurrentPageImg');
  const btnExportAllPagesZip = document.getElementById('btnExportAllPagesZip');
  const pdfToImgFormat = document.getElementById('pdfToImgFormat');
  const pdfToImgDpi = document.getElementById('pdfToImgDpi');

  pdfToImageDropzone.addEventListener('click', () => pdfToImageInput.click());
  pdfToImageInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      loadMainPdf(e.target.files[0]);
    }
  });

  // Export current page as image
  btnExportCurrentPageImg.addEventListener('click', async () => {
    if (!globalPdfDoc) return;
    showToast('Rendering high-res image...', 'info');

    const dpi = parseInt(pdfToImgDpi.value) || 300;
    const scale = dpi / 72;
    const format = pdfToImgFormat.value; // 'png', 'jpeg', 'webp'
    const mime = `image/${format}`;

    const page = await globalPdfDoc.getPage(globalCurrentPage);
    const viewport = page.getViewport({ scale: scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    canvas.toBlob((blob) => {
      const baseName = globalPdfFile.name.replace(/\.[^/.]+$/, "");
      triggerDownload(blob, `${baseName}_page_${globalCurrentPage}.${format === 'jpeg' ? 'jpg' : format}`);
    }, mime, 0.95);
  });

  // Export all pages as ZIP
  btnExportAllPagesZip.addEventListener('click', async () => {
    if (!globalPdfDoc) return;
    showToast(`Rendering all ${globalTotalPages} pages...`, 'info');

    const dpi = parseInt(pdfToImgDpi.value) || 300;
    const scale = dpi / 72;
    const format = pdfToImgFormat.value;
    const mime = `image/${format}`;
    const zip = new JSZip();
    const baseName = globalPdfFile.name.replace(/\.[^/.]+$/, "");

    for (let i = 1; i <= globalTotalPages; i++) {
      const page = await globalPdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;
      const imgDataUrl = canvas.toDataURL(mime, 0.95);
      const base64Data = imgDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      zip.file(`${baseName}_page_${i}.${format === 'jpeg' ? 'jpg' : format}`, base64Data, { base64: true });
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerDownload(zipBlob, `${baseName}_All_Pages_Images.zip`);
  });

  // Image to Image converter
  const imgConvertDropzone = document.getElementById('imgConvertDropzone');
  const imgConvertInput = document.getElementById('imgConvertInput');
  const imgConvertFileName = document.getElementById('imgConvertFileName');
  const imgTargetFormat = document.getElementById('imgTargetFormat');
  const imgQualitySlider = document.getElementById('imgQualitySlider');
  const imgQualityVal = document.getElementById('imgQualityVal');
  const btnConvertImage = document.getElementById('btnConvertImage');
  let currentLoadedImage = null;

  imgConvertDropzone.addEventListener('click', () => imgConvertInput.click());
  imgQualitySlider.addEventListener('input', () => {
    imgQualityVal.textContent = `${imgQualitySlider.value}%`;
  });

  imgConvertInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      imgConvertFileName.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          currentLoadedImage = { img, name: file.name };
          btnConvertImage.disabled = false;
          showToast(`Image loaded: ${file.name}`, 'success');
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  btnConvertImage.addEventListener('click', () => {
    if (!currentLoadedImage) return;
    const canvas = document.createElement('canvas');
    canvas.width = currentLoadedImage.img.width;
    canvas.height = currentLoadedImage.img.height;
    const ctx = canvas.getContext('2d');

    const targetFmt = imgTargetFormat.value;
    if (targetFmt === 'jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(currentLoadedImage.img, 0, 0);

    const quality = parseInt(imgQualitySlider.value) / 100;
    const mime = `image/${targetFmt}`;
    canvas.toBlob((blob) => {
      const base = currentLoadedImage.name.replace(/\.[^/.]+$/, "");
      triggerDownload(blob, `${base}.${targetFmt === 'jpeg' ? 'jpg' : targetFmt}`);
    }, mime, quality);
  });

  // Images to PDF
  const imagesToPdfDropzone = document.getElementById('imagesToPdfDropzone');
  const imagesToPdfInput = document.getElementById('imagesToPdfInput');
  const imagesToPdfCount = document.getElementById('imagesToPdfCount');
  const imagesToPdfList = document.getElementById('imagesToPdfList');
  const btnMergeImagesToPdf = document.getElementById('btnMergeImagesToPdf');
  let selectedImagesToPdf = [];

  imagesToPdfDropzone.addEventListener('click', () => imagesToPdfInput.click());
  imagesToPdfInput.addEventListener('change', (e) => {
    if (e.target.files) {
      selectedImagesToPdf = Array.from(e.target.files);
      imagesToPdfCount.textContent = `${selectedImagesToPdf.length} images selected`;
      imagesToPdfList.innerHTML = selectedImagesToPdf.map(f => `<div>• ${escapeHtml(f.name)} (${formatBytes(f.size)})</div>`).join('');
      btnMergeImagesToPdf.disabled = selectedImagesToPdf.length === 0;
    }
  });

  btnMergeImagesToPdf.addEventListener('click', async () => {
    if (selectedImagesToPdf.length === 0) return;
    showToast('Merging images into PDF...', 'info');

    const form = new FormData();
    selectedImagesToPdf.forEach(f => form.append('images', f));

    try {
      const res = await fetch('/api/images-to-pdf', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Merge failed');
      const blob = await res.blob();
      triggerDownload(blob, 'combined_images.pdf');
    } catch (err) {
      showToast('Error merging images: ' + err.message, 'error');
    }
  });

  // =========================================================================
  // 3. PDF IMAGE & AREA CROPPER
  // =========================================================================
  const cropperPlaceholder = document.getElementById('cropperPlaceholder');
  const cropperImageContainer = document.getElementById('cropperImageContainer');
  const cropperTargetImage = document.getElementById('cropperTargetImage');
  const btnLoadPdfForCropper = document.getElementById('btnLoadPdfForCropper');
  const cropperAspectSelect = document.getElementById('cropperAspectSelect');
  const cropperExportFormat = document.getElementById('cropperExportFormat');
  const btnDownloadCroppedImage = document.getElementById('btnDownloadCroppedImage');
  const btnCropPdfPage = document.getElementById('btnCropPdfPage');
  const cropDimensionsDisplay = document.getElementById('cropDimensionsDisplay');
  let cropperInstance = null;
  let cropperCanvasScale = 1.0;

  btnLoadPdfForCropper.addEventListener('click', () => fileInput.click());

  async function initCropperWithCurrentPdf() {
    if (!globalPdfDoc) return;

    cropperPlaceholder.style.display = 'none';
    cropperImageContainer.style.display = 'block';

    const page = await globalPdfDoc.getPage(globalCurrentPage);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for sharp crop
    cropperCanvasScale = 2.0;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    cropperTargetImage.src = canvas.toDataURL('image/png');

    if (cropperInstance) cropperInstance.destroy();

    cropperInstance = new Cropper(cropperTargetImage, {
      viewMode: 1,
      aspectRatio: parseFloat(cropperAspectSelect.value),
      autoCropArea: 0.7,
      crop(event) {
        cropDimensionsDisplay.textContent = 
          `W: ${Math.round(event.detail.width)}px | H: ${Math.round(event.detail.height)}px`;
      }
    });
  }

  cropperAspectSelect.addEventListener('change', () => {
    if (cropperInstance) {
      cropperInstance.setAspectRatio(parseFloat(cropperAspectSelect.value));
    }
  });

  btnDownloadCroppedImage.addEventListener('click', () => {
    if (!cropperInstance) return;
    const croppedCanvas = cropperInstance.getCroppedCanvas();
    const format = cropperExportFormat.value;
    croppedCanvas.toBlob((blob) => {
      const ext = format === 'image/jpeg' ? 'jpg' : 'png';
      triggerDownload(blob, `cropped_image.${ext}`);
    }, format, 0.95);
  });

  btnCropPdfPage.addEventListener('click', async () => {
    if (!cropperInstance || !globalPdfFile) return;
    showToast('Cropping PDF page boundaries...', 'info');

    const cropData = cropperInstance.getData();
    // Convert back from 2x scale to 72 DPI PDF point units
    const pdfX = cropData.x / cropperCanvasScale;
    const pdfYTop = cropData.y / cropperCanvasScale;
    const pdfW = cropData.width / cropperCanvasScale;
    const pdfH = cropData.height / cropperCanvasScale;

    const form = new FormData();
    form.append('file', globalPdfFile);
    form.append('pageIndex', globalCurrentPage - 1);
    form.append('x', pdfX);
    form.append('y', pdfYTop);
    form.append('width', pdfW);
    form.append('height', pdfH);

    try {
      const res = await fetch('/api/pdf/crop-page', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Crop request failed');
      const blob = await res.blob();
      triggerDownload(blob, `${globalPdfFile.name.replace(/\.[^/.]+$/, "")}_cropped.pdf`);
    } catch (err) {
      showToast('Error cropping PDF: ' + err.message, 'error');
    }
  });

  // =========================================================================
  // 4. PDF TEXT & WORD EDITOR ("Change words in that PDF")
  // =========================================================================
  const textEditorPlaceholder = document.getElementById('textEditorPlaceholder');
  const textEditorCanvasWrapper = document.getElementById('textEditorCanvasWrapper');
  const textEditorCanvas = document.getElementById('textEditorCanvas');
  const textEditorOverlay = document.getElementById('textEditorOverlay');
  const textEditorStage = document.getElementById('textEditorStage');
  const btnLoadPdfForEditor = document.getElementById('btnLoadPdfForEditor');

  const editorPageInfoBadge = document.getElementById('editorPageInfoBadge');
  const btnEditorPrevPage = document.getElementById('btnEditorPrevPage');
  const btnEditorNextPage = document.getElementById('btnEditorNextPage');
  const editorPageIndicator = document.getElementById('editorPageIndicator');

  const btnEditorZoomOut = document.getElementById('btnEditorZoomOut');
  const btnEditorZoomIn = document.getElementById('btnEditorZoomIn');
  const btnEditorFitPage = document.getElementById('btnEditorFitPage');
  const btnEditorActualSize = document.getElementById('btnEditorActualSize');
  const editorZoomVal = document.getElementById('editorZoomVal');

  // Sub-tabs
  const subtabBtns = document.querySelectorAll('.subtab-btn');
  const subtabPanes = {
    'find-replace': document.getElementById('subtabPane-find-replace'),
    'click-patch': document.getElementById('subtabPane-click-patch')
  };

  subtabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetSubtab = btn.getAttribute('data-subtab');
      subtabBtns.forEach(b => b.classList.remove('active'));
      Object.values(subtabPanes).forEach(pane => pane && pane.classList.remove('active'));

      btn.classList.add('active');
      if (subtabPanes[targetSubtab]) {
        subtabPanes[targetSubtab].classList.add('active');
      }
    });
  });

  const findTextInput = document.getElementById('findTextInput');
  const replaceTextInput = document.getElementById('replaceTextInput');
  const btnApplyFindReplace = document.getElementById('btnApplyFindReplace');

  const manualTextInput = document.getElementById('manualTextInput');
  const editorFontFamily = document.getElementById('editorFontFamily');
  const editorFontSize = document.getElementById('editorFontSize');
  const editorTextColor = document.getElementById('editorTextColor');
  const editorBgColor = document.getElementById('editorBgColor');

  const stagedEditsContainer = document.getElementById('stagedEditsContainer');
  const stagedEditCount = document.getElementById('stagedEditCount');
  const btnClearEdits = document.getElementById('btnClearEdits');
  const btnSaveEditedPdf = document.getElementById('btnSaveEditedPdf');

  let stagedEdits = [];
  let editorViewportScale = 1.0;
  let isFitMode = true;

  btnLoadPdfForEditor.addEventListener('click', () => fileInput.click());

  // Page navigation in editor
  btnEditorPrevPage.addEventListener('click', async () => {
    if (globalCurrentPage > 1) {
      globalCurrentPage--;
      updateEditorPageStatus();
      await renderTextEditorPage();
    }
  });

  btnEditorNextPage.addEventListener('click', async () => {
    if (globalCurrentPage < globalTotalPages) {
      globalCurrentPage++;
      updateEditorPageStatus();
      await renderTextEditorPage();
    }
  });

  function updateEditorPageStatus() {
    editorPageIndicator.textContent = `Page ${globalCurrentPage} of ${globalTotalPages}`;
    editorPageInfoBadge.textContent = `Page ${globalCurrentPage}`;
    btnEditorPrevPage.disabled = globalCurrentPage <= 1;
    btnEditorNextPage.disabled = globalCurrentPage >= globalTotalPages;
  }

  // Zoom controls
  btnEditorFitPage.addEventListener('click', async () => {
    isFitMode = true;
    btnEditorFitPage.classList.add('active');
    btnEditorActualSize.classList.remove('active');
    await renderTextEditorPage();
  });

  btnEditorActualSize.addEventListener('click', async () => {
    isFitMode = false;
    editorViewportScale = 1.0;
    btnEditorFitPage.classList.remove('active');
    btnEditorActualSize.classList.add('active');
    editorZoomVal.textContent = '100%';
    await renderTextEditorPage();
  });

  btnEditorZoomIn.addEventListener('click', async () => {
    isFitMode = false;
    btnEditorFitPage.classList.remove('active');
    btnEditorActualSize.classList.remove('active');
    editorViewportScale = Math.min(3.0, editorViewportScale * 1.25);
    editorZoomVal.textContent = `${Math.round(editorViewportScale * 100)}%`;
    await renderTextEditorPage();
  });

  btnEditorZoomOut.addEventListener('click', async () => {
    isFitMode = false;
    btnEditorFitPage.classList.remove('active');
    btnEditorActualSize.classList.remove('active');
    editorViewportScale = Math.max(0.3, editorViewportScale / 1.25);
    editorZoomVal.textContent = `${Math.round(editorViewportScale * 100)}%`;
    await renderTextEditorPage();
  });

  // Calculate auto-fit scale so 100% of the document fits inside view
  function calculateFitScale(page) {
    const stageWidth = (textEditorStage.clientWidth || 800) - 40;
    const stageHeight = (textEditorStage.clientHeight || 550) - 40;
    const unscaled = page.getViewport({ scale: 1.0 });

    const scaleW = stageWidth / unscaled.width;
    const scaleH = stageHeight / unscaled.height;

    // Use smaller scale to fit both width and height inside container
    return Math.max(0.2, Math.min(scaleW, scaleH, 2.0));
  }

  // Handle window resize dynamically to keep page auto-fitted
  window.addEventListener('resize', () => {
    if (isFitMode && globalPdfDoc) {
      const editorTab = document.getElementById('tab-text-editor');
      if (editorTab && editorTab.classList.contains('active')) {
        renderTextEditorPage();
      }
    }
  });

  async function initTextEditorWithCurrentPdf() {
    if (!globalPdfDoc) return;
    textEditorPlaceholder.style.display = 'none';
    textEditorCanvasWrapper.style.display = 'block';

    updateEditorPageStatus();
    isFitMode = true;
    btnEditorFitPage.classList.add('active');

    await renderTextEditorPage();
  }

  async function renderTextEditorPage() {
    if (!globalPdfDoc) return;
    const page = await globalPdfDoc.getPage(globalCurrentPage);

    if (isFitMode) {
      editorViewportScale = calculateFitScale(page);
      editorZoomVal.textContent = 'Fit';
    }

    const viewport = page.getViewport({ scale: editorViewportScale });

    textEditorCanvas.width = viewport.width;
    textEditorCanvas.height = viewport.height;
    const ctx = textEditorCanvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    renderTextEditorOverlay();
  }

  // Click on editor canvas: open in-place popover for instant editing
  textEditorCanvas.addEventListener('click', (e) => {
    // Remove existing popover if any
    const existingPopover = document.querySelector('.in-place-popover');
    if (existingPopover) existingPopover.remove();

    const rect = textEditorCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const unscaledX = clickX / editorViewportScale;
    const unscaledY = clickY / editorViewportScale;

    // Create interactive in-place popover
    const popover = document.createElement('div');
    popover.className = 'in-place-popover';
    
    // Position popover safely inside viewport
    const popX = Math.min(clickX, rect.width - 290);
    const popY = Math.max(10, Math.min(clickY - 60, rect.height - 180));
    popover.style.left = `${popX}px`;
    popover.style.top = `${popY}px`;

    popover.innerHTML = `
      <div class="in-place-popover-header">
        <span>✏️ EDIT TEXT AT (${Math.round(unscaledX)}, ${Math.round(unscaledY)})</span>
      </div>
      <input type="text" class="in-place-popover-input" id="popoverTextInput" placeholder="Type new word here..." value="${escapeHtml(manualTextInput.value.trim())}">
      <div style="display:flex;gap:0.4rem;align-items:center;">
        <span style="font-size:0.75rem;color:var(--text-muted);">Size:</span>
        <input type="number" id="popoverFontSize" value="${editorFontSize.value || 14}" min="6" max="72" style="width:55px;padding:0.25rem;background:#090d16;border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:4px;font-size:0.8rem;">
        <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto;">Color:</span>
        <input type="color" id="popoverColor" value="${editorTextColor.value || '#000000'}" style="width:32px;height:24px;border:none;background:none;cursor:pointer;">
      </div>
      <div class="in-place-popover-actions">
        <button type="button" class="btn-popover-apply" id="btnPopoverApply">✓ Apply Patch</button>
        <button type="button" class="btn-popover-cancel" id="btnPopoverCancel">✕</button>
      </div>
    `;

    textEditorCanvasWrapper.appendChild(popover);

    const popInput = popover.querySelector('#popoverTextInput');
    popInput.focus();

    popover.querySelector('#btnPopoverCancel').addEventListener('click', () => popover.remove());

    popover.querySelector('#btnPopoverApply').addEventListener('click', () => {
      const newText = popInput.value.trim();
      const fontSize = parseFloat(popover.querySelector('#popoverFontSize').value) || 14;
      const textColor = popover.querySelector('#popoverColor').value;
      const boxW = Math.max(60, (newText.length || 6) * (fontSize * 0.65));
      const boxH = fontSize * 1.5;

      const editObj = {
        pageIndex: globalCurrentPage - 1,
        x: unscaledX,
        y: Math.max(0, unscaledY - (boxH / 2)),
        width: boxW,
        height: boxH,
        newText: newText,
        fontSize: fontSize,
        fontFamily: editorFontFamily.value,
        textColor: textColor,
        bgColor: editorBgColor.value,
        coordinateOrigin: 'top-left'
      };

      stagedEdits.push(editObj);
      updateStagedEditsList();
      renderTextEditorOverlay();
      popover.remove();
      showToast(`Staged edit: "${newText || '[Whiteout]'}"`, 'success');
    });
  });

  // Find & Replace Word Scanning
  btnApplyFindReplace.addEventListener('click', async () => {
    const findWord = findTextInput.value.trim();
    const replaceWord = replaceTextInput.value.trim();

    if (!findWord) {
      showToast('Please enter a word to find.', 'error');
      return;
    }

    if (!globalPdfDoc) {
      showToast('Please load a PDF first.', 'error');
      return;
    }

    showToast(`Searching for "${findWord}"...`, 'info');
    let matchCount = 0;

    for (let p = 1; p <= globalTotalPages; p++) {
      const page = await globalPdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1.0 });

      for (const item of textContent.items) {
        if (item.str && item.str.toLowerCase().includes(findWord.toLowerCase())) {
          matchCount++;
          const tx = item.transform[4];
          const ty = item.transform[5];
          const itemHeight = Math.abs(item.transform[3]) || 12;
          const itemWidth = item.width || (item.str.length * 8);

          // Convert from bottom-left to top-left coordinates
          const topY = viewport.height - ty - itemHeight;

          stagedEdits.push({
            pageIndex: p - 1,
            x: tx,
            y: topY,
            width: itemWidth,
            height: itemHeight + 2,
            newText: replaceWord,
            fontSize: Math.round(itemHeight * 0.9),
            fontFamily: editorFontFamily.value,
            textColor: editorTextColor.value,
            bgColor: '#ffffff',
            coordinateOrigin: 'top-left'
          });
        }
      }
    }

    if (matchCount > 0) {
      updateStagedEditsList();
      renderTextEditorOverlay();
      showToast(`Found and staged ${matchCount} match(es)!`, 'success');
    } else {
      showToast(`No instances of "${findWord}" found.`, 'error');
    }
  });

  function updateStagedEditsList() {
    stagedEditCount.textContent = stagedEdits.length;
    btnSaveEditedPdf.disabled = stagedEdits.length === 0;

    if (stagedEdits.length === 0) {
      stagedEditsContainer.innerHTML = '<span style="color: var(--text-subtle);">No word changes staged yet.</span>';
      return;
    }

    stagedEditsContainer.innerHTML = stagedEdits.map((e, idx) => `
      <div class="staged-edit-chip">
        <span>Pg ${e.pageIndex + 1}: <strong>"${escapeHtml(e.newText || '[Whiteout]')}"</strong></span>
        <button type="button" onclick="window.removeEdit(${idx})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.85rem;">✕</button>
      </div>
    `).join('');
  }

  window.removeEdit = (idx) => {
    stagedEdits.splice(idx, 1);
    updateStagedEditsList();
    renderTextEditorOverlay();
  };

  btnClearEdits.addEventListener('click', () => {
    stagedEdits = [];
    updateStagedEditsList();
    renderTextEditorOverlay();
    const existingPopover = document.querySelector('.in-place-popover');
    if (existingPopover) existingPopover.remove();
  });

  function renderTextEditorOverlay() {
    textEditorOverlay.innerHTML = '';
    const currentEdits = stagedEdits.filter(e => e.pageIndex === globalCurrentPage - 1);

    currentEdits.forEach(e => {
      const el = document.createElement('div');
      el.className = 'text-edit-patch';
      el.style.left = `${e.x * editorViewportScale}px`;
      el.style.top = `${e.y * editorViewportScale}px`;
      el.style.width = `${e.width * editorViewportScale}px`;
      el.style.height = `${e.height * editorViewportScale}px`;
      el.textContent = e.newText;
      textEditorOverlay.appendChild(el);
    });
  }

  // Download modified PDF
  btnSaveEditedPdf.addEventListener('click', async () => {
    if (stagedEdits.length === 0 || !globalPdfFile) return;
    showToast('Applying changes to PDF...', 'info');

    const form = new FormData();
    form.append('file', globalPdfFile);
    form.append('edits', JSON.stringify(stagedEdits));

    try {
      const res = await fetch('/api/pdf/edit-text', { method: 'POST', body: form });
      if (!res.ok) throw new Error('Edit failed');
      const blob = await res.blob();
      const baseName = globalPdfFile.name.replace(/\.[^/.]+$/, "");
      triggerDownload(blob, `${baseName}_edited.pdf`);
      showToast('Updated PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast('Error editing PDF: ' + err.message, 'error');
    }
  });

  // =========================================================================
  // UTILITIES
  // =========================================================================
  function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function detectStandardPaperFormat(w, h) {
    const min = Math.min(w, h);
    const max = Math.max(w, h);
    if (Math.abs(min - 210) < 5 && Math.abs(max - 297) < 5) return 'A4 Format';
    if (Math.abs(min - 297) < 5 && Math.abs(max - 420) < 5) return 'A3 Format';
    if (Math.abs(min - 148) < 5 && Math.abs(max - 210) < 5) return 'A5 Format';
    if (Math.abs(min - 215.9) < 5 && Math.abs(max - 279.4) < 5) return 'US Letter';
    return `${Math.round(w)} × ${Math.round(h)} mm`;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function escapeHtml(s) {
    return (s || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
  }
});
