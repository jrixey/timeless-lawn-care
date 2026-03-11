// ================================================
// YARD SCORE — Frontend Logic
// ================================================

// ---- SERVICE AREA ZIP CODES ----
const SERVICE_AREA_ZIPS = [
    '64116', // North Kansas City
    '64117', // North Kansas City / Gladstone
    '64118', // Gladstone
    '64119', // Gladstone / Pleasant Valley
    '64150', // Riverside
    '64151', // Platte County / north KC area
    '64152', // Parkville / Weatherby Lake
    '64153', // Parkville
    '64068', // Liberty
    '64069', // Liberty
];

// ---- MAX IMAGE SIZE (1MB after compression) ----
const MAX_IMAGE_BYTES = 1 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1200;

// ---- DOM ELEMENTS ----
const dropzone = document.getElementById('dropzone');
const dropzoneContent = document.getElementById('dropzoneContent');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removePhotoBtn = document.getElementById('removePhoto');
const fileInput = document.getElementById('fileInput');
const yardForm = document.getElementById('yardForm');
const submitBtn = document.getElementById('submitBtn');
const zipCodeInput = document.getElementById('zipCode');
const phoneInput = document.getElementById('ysPhone');

const uploadSection = document.getElementById('upload');
const heroSection = document.querySelector('.ys-hero');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const errorSection = document.getElementById('errorSection');

let selectedFile = null;
let compressedBase64 = null;
let compressedMediaType = null;

// ---- NAVBAR (same as main site) ----
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
});

navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('active');
        navLinks.classList.remove('open');
    });
});

// ---- PHONE NUMBER FORMATTING ----
if (phoneInput) {
    phoneInput.addEventListener('input', function (e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 6) {
            value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
        } else if (value.length >= 3) {
            value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
        }
        e.target.value = value;
    });
}

// ---- ZIP CODE — numbers only ----
zipCodeInput.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
    updateSubmitState();
});

// ---- DRAG AND DROP ----
dropzone.addEventListener('click', () => {
    if (!selectedFile) fileInput.click();
});

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

removePhotoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearImage();
});

// ---- FILE HANDLING ----
function handleFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        alert('Please upload a JPG, PNG, or WebP image.');
        return;
    }
    if (file.size > 25 * 1024 * 1024) {
        alert('Image must be under 25MB.');
        return;
    }

    selectedFile = file;
    compressAndPreview(file);
}

function compressAndPreview(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Resize if wider than MAX_IMAGE_WIDTH
            if (width > MAX_IMAGE_WIDTH) {
                height = Math.round((height * MAX_IMAGE_WIDTH) / width);
                width = MAX_IMAGE_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG at 0.8 quality
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            compressedBase64 = dataUrl.split(',')[1];
            compressedMediaType = 'image/jpeg';

            // Show preview
            imagePreview.src = dataUrl;
            dropzoneContent.style.display = 'none';
            previewContainer.style.display = 'block';
            dropzone.classList.add('has-image');

            updateSubmitState();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function clearImage() {
    selectedFile = null;
    compressedBase64 = null;
    compressedMediaType = null;
    fileInput.value = '';
    imagePreview.src = '';
    dropzoneContent.style.display = 'flex';
    previewContainer.style.display = 'none';
    dropzone.classList.remove('has-image');
    updateSubmitState();
}

// ---- SUBMIT STATE ----
function updateSubmitState() {
    const hasImage = compressedBase64 !== null;
    const hasZip = zipCodeInput.value.length === 5;
    submitBtn.disabled = !(hasImage && hasZip);
}

// ---- FORM SUBMISSION ----
yardForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const zipCode = zipCodeInput.value.trim();

    if (!compressedBase64) {
        alert('Please upload a photo of your yard.');
        return;
    }

    if (zipCode.length !== 5) {
        alert('Please enter a valid 5-digit zip code.');
        return;
    }

    // Show loading
    showSection('loading');

    const payload = {
        image: compressedBase64,
        mediaType: compressedMediaType,
        zipCode: zipCode,
        name: document.getElementById('ysName').value.trim(),
        phone: document.getElementById('ysPhone').value.trim(),
        email: document.getElementById('ysEmail').value.trim(),
    };

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Analysis failed');
        }

        const data = await response.json();
        displayResults(data, zipCode);
    } catch (err) {
        console.error('Analysis error:', err);
        document.getElementById('errorMessage').textContent =
            err.message || "We couldn't analyze your photo. Please try again with a different image.";
        showSection('error');
    }
});

// ---- SECTION VISIBILITY ----
function showSection(section) {
    heroSection.style.display = section === 'upload' ? '' : 'none';
    document.querySelector('.ys-upload-section').style.display = section === 'upload' ? '' : 'none';
    loadingSection.style.display = section === 'loading' ? '' : 'none';
    resultsSection.style.display = section === 'results' ? '' : 'none';
    errorSection.style.display = section === 'error' ? '' : 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- DISPLAY RESULTS ----
function displayResults(data, zipCode) {
    // Summary
    document.getElementById('resultsSummary').textContent = data.summary || '';

    // Grass type badge
    const grassTypeEl = document.getElementById('grassType');
    if (data.grassType) {
        grassTypeEl.innerHTML = `
            <div class="ys-grass-badge">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M12 6v6l4 2"/></svg>
                Grass Type: ${escapeHtml(data.grassType)}
            </div>
        `;
    } else {
        grassTypeEl.innerHTML = '';
    }

    // Observations
    const obsList = document.getElementById('observationsList');
    obsList.innerHTML = '';
    if (data.observations && data.observations.length > 0) {
        data.observations.forEach((obs) => {
            const card = document.createElement('div');
            card.className = 'ys-obs-card';
            card.innerHTML = `
                <div class="ys-obs-category">${escapeHtml(obs.category)}</div>
                <div class="ys-obs-text">${escapeHtml(obs.observation)}</div>
            `;
            obsList.appendChild(card);
        });
    }

    // Mowing tip
    const mowingTipEl = document.getElementById('mowingTip');
    if (data.mowingTip) {
        mowingTipEl.style.display = '';
        mowingTipEl.innerHTML = `
            <div class="ys-mowing-tip-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7A917E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/><path d="M2 12h20"/><path d="M12 6v12"/></svg>
                Mowing Advice
            </div>
            <div class="ys-mowing-tip-text">${escapeHtml(data.mowingTip)}</div>
        `;
    } else {
        mowingTipEl.style.display = 'none';
    }

    // Recommendations
    const recsList = document.getElementById('recsList');
    recsList.innerHTML = '';
    if (data.recommendations && data.recommendations.length > 0) {
        data.recommendations.forEach((rec, idx) => {
            const priorityLabel = rec.priority || 'medium';
            const card = document.createElement('div');
            card.className = 'ys-rec-card';
            card.innerHTML = `
                <div class="ys-rec-priority ${priorityLabel}">${idx + 1}</div>
                <div class="ys-rec-content">
                    <div class="ys-rec-title">${escapeHtml(rec.title || '')}</div>
                    <div class="ys-rec-details">${escapeHtml(rec.details || rec.recommendation || '')}</div>
                </div>
            `;
            recsList.appendChild(card);
        });
    }

    // Seasonal note
    const seasonNote = document.getElementById('seasonNote');
    if (data.seasonalNote) {
        seasonNote.style.display = '';
        seasonNote.innerHTML = `<strong>Right Now in KC:</strong> ${escapeHtml(data.seasonalNote)}`;
    } else if (data.season) {
        seasonNote.style.display = '';
        seasonNote.innerHTML = `<strong>Right Now in KC:</strong> ${escapeHtml(data.season)}`;
    } else {
        seasonNote.style.display = 'none';
    }

    // Service area message
    const areaMsg = document.getElementById('areaMessage');
    const inArea = SERVICE_AREA_ZIPS.includes(zipCode);
    areaMsg.style.display = '';
    if (inArea) {
        areaMsg.className = 'ys-area-message in-area';
        areaMsg.innerHTML = "Great news! You're in our service area. We'd love to take care of your lawn.";
    } else {
        areaMsg.className = 'ys-area-message out-of-area';
        areaMsg.innerHTML = "We don't currently service your area, but we hope this analysis was helpful! We're expanding soon and would love to keep in touch.";
    }

    showSection('results');
}

// ---- HELPERS ----
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ---- RETRY / TRY AGAIN ----
document.getElementById('tryAgainBtn').addEventListener('click', () => {
    resetForm();
    showSection('upload');
});

document.getElementById('errorRetryBtn').addEventListener('click', () => {
    resetForm();
    showSection('upload');
});

function resetForm() {
    clearImage();
    yardForm.reset();
    updateSubmitState();
}
