const symptomsData = {
    'Head': ['Slight Headache', 'Unconscious', 'High Fever', 'Mild Cold'],
    'Chest': ['Chest Pain', 'Difficulty Breathing', 'Persistent Cough'],
    'Stomach': ['Persistent Vomiting', 'Abdominal Cramps'],
    'Limbs': ['Deep Cut', 'Minor Rash', 'Fracture']
};

const severityMessages = {
    'Red': 'Critical Emergency. Evacuate immediately or call for advanced life support.',
    'Yellow': 'Urgent Case. Needs medical attention soon. Monitor closely.',
    'Green': 'Routine Case. Observe and treat locally when possible.'
};

function typeEffect(element, text, speed=15) {
    element.textContent = '';
    // Stop any ongoing typing effect on this element
    if (element.typingTimeout) clearTimeout(element.typingTimeout);
    
    let i = 0;
    function typeWriter() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            element.typingTimeout = setTimeout(typeWriter, speed);
        }
    }
    typeWriter();
}

// Toggle this variable when deploying to Render or using a different preview URL.
const API_URL = 'http://127.0.0.1:5000';

// 1. Service Worker for Offline PWA Support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered for Offline Use.', reg.scope))
            .catch(err => console.error('Service Worker Registration failed:', err));
    });
}

const selectedSymptoms = new Set();
let currentActivePart = null;

const bodyParts = document.querySelectorAll('.body-part');
const symptomsContainer = document.getElementById('symptoms-container');
const currentPartTitle = document.getElementById('current-part-title');
const instructionText = document.getElementById('instruction-text');
const selectedList = document.getElementById('selected-list');
const checkSeverityBtn = document.getElementById('check-severity-btn');
const resultOverlay = document.getElementById('result-overlay');
const severityBadge = document.getElementById('severity-badge');
const severityDesc = document.getElementById('severity-desc');
const closeResultBtn = document.getElementById('close-result-btn');

// Booking logic
const bookingOverlay = document.getElementById('booking-overlay');
const closeBookingBtn = document.getElementById('close-booking-btn');
const confirmBookingBtn = document.getElementById('confirm-booking-btn');

// New logic
const villageSelect = document.getElementById('village-select');
const feedbackForm = document.getElementById('feedback-form');
const complaintText = document.getElementById('complaint-text');
const feedbackSuccess = document.getElementById('feedback-success');
const submitFeedbackBtn = document.getElementById('submit-feedback-btn');

// 2. Translation Context Logic
let activeTranslations = {};
const langSelect = document.getElementById('lang-select');

// Web Speech Elements
const spokenSymptoms = document.getElementById('spoken-symptoms');
const micBtn = document.getElementById('mic-btn');

// Load Translations
fetch('translations.json')
    .then(res => res.json())
    .then(data => {
        activeTranslations = data;
        applyLanguage(langSelect.value); // Apply initial
    })
    .catch(err => console.log("Translations might be unavailable without server", err));

langSelect.addEventListener('change', (e) => applyLanguage(e.target.value));

function applyLanguage(langCode) {
    const d = activeTranslations[langCode];
    if (!d) return;
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (d[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = d[key];
            } else {
                el.textContent = d[key];
            }
        }
    });
    
    // Safety sync checking logic
    updateButtonStatus();
}

// 3. Web Speech API Logic
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    
    recognition.onstart = () => {
        micBtn.style.backgroundColor = 'var(--red)';
        micBtn.style.color = 'white';
        micBtn.style.borderColor = 'var(--red)';
    };
    
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        const currentText = spokenSymptoms.value.trim();
        spokenSymptoms.value = currentText ? `${currentText}, ${transcript}` : transcript;
        updateButtonStatus(); // Will enable Submit button since text exists
    };
    
    recognition.onend = () => {
        micBtn.style.backgroundColor = '#f1f3f5';
        micBtn.style.color = 'var(--red)';
        micBtn.style.borderColor = '#ced4da';
    };
    
    micBtn.addEventListener('click', () => {
        // Toggle language based on app language config
        recognition.lang = langSelect.value === 'te' ? 'te-IN' : 'en-US';
        recognition.start();
    });
} else {
    micBtn.style.display = 'none'; // Hide if browser doesn't support Web Speech.
}

// Group multiple paths making up the Limbs under the same visual interaction
const limbIds = ['left-arm', 'right-arm', 'left-leg', 'right-leg'];

bodyParts.forEach(part => {
    part.addEventListener('click', function(e) {
        // Prevent event bubbling if necessary
        e.stopPropagation();
        
        const partName = this.getAttribute('data-part');
        if (typeof abortTriage === 'function') abortTriage(); // Added abort override
        
        // Update active styling
        bodyParts.forEach(p => {
            if (p.getAttribute('data-part') === partName) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
        
        renderSymptoms(partName);
    });
});

function renderSymptoms(partName) {
    currentPartTitle.textContent = `${partName} Assessment`;
    instructionText.style.display = 'none';
    symptomsContainer.innerHTML = '';
    
    const symptoms = symptomsData[partName] || [];
    
    symptoms.forEach(symptom => {
        const div = document.createElement('div');
        div.className = 'symptom-checkbox';
        
        const id = `sym-${symptom.replace(/\s+/g, '-').toLowerCase()}`;
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = id;
        input.value = symptom;
        input.checked = selectedSymptoms.has(symptom);
        
        // Toggle on entire row click
        div.addEventListener('click', (e) => {
            if (e.target !== input) {
                input.checked = !input.checked;
                input.dispatchEvent(new Event('change'));
            }
        });
        
        input.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedSymptoms.add(symptom);
            } else {
                selectedSymptoms.delete(symptom);
            }
            updateSelectedView();
        });
        
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = symptom;
        
        div.appendChild(input);
        div.appendChild(label);
        symptomsContainer.appendChild(div);
    });
}

function updateSelectedView() {
    if (typeof abortTriage === 'function') abortTriage(); // Cancel any existing process
    
    selectedList.innerHTML = '';
    
    if (selectedSymptoms.size === 0) {
        const emptyState = document.createElement('li');
        emptyState.className = 'empty-state';
        emptyState.textContent = 'No symptoms recorded yet';
        selectedList.appendChild(emptyState);
    } else {
        selectedSymptoms.forEach(sym => {
            const li = document.createElement('li');
            li.textContent = sym;
            selectedList.appendChild(li);
        });
    }
    
    updateButtonStatus();
}

spokenSymptoms.addEventListener('input', updateButtonStatus);

// Unify the logic to know when the button should be active
function updateButtonStatus() {
    checkSeverityBtn.disabled = (selectedSymptoms.size === 0 && !spokenSymptoms.value.trim());
}

checkSeverityBtn.addEventListener('click', async () => {
    const patientName = document.getElementById('patientName').value.trim();
    const patientAge = document.getElementById('patientAge').value.trim();
    const patientGender = document.getElementById('patientGender').value;
    
    if (!patientName || !patientAge || !patientGender) {
        alert('Please fill in the Patient Name, Age, and Gender before analyzing severity.');
        return;
    }

    // Generate combined total list
    const combinedArr = [Array.from(selectedSymptoms).join(', '), spokenSymptoms.value.trim()].filter(Boolean);
    const symptomsStr = combinedArr.join(', ');
    
    if (!symptomsStr) {
        alert('Please select or input at least one symptom.');
        return;
    }
    
    const originalText = 'Analyze Severity';
    checkSeverityBtn.textContent = 'Analyzing...';
    checkSeverityBtn.disabled = true;
    
    if (window.globalTriageController) window.globalTriageController.abort();
    window.globalTriageController = new AbortController();
    const signal = window.globalTriageController.signal;
    
    try {
        const response = await fetch(`${API_URL}/triage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                name: patientName,
                age: patientAge,
                gender: patientGender,
                symptoms: symptomsStr,
                village: villageSelect.value
            }),
            signal: signal
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.severity_color) {
            showResult(data.severity_color, data.home_care_instructions, data.book_appointment, data.ai_suggestion);
            loadMonitorData(); // Refresh the monitor dynamically after submission!
        } else {
            alert('Error determining severity from backend.');
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Triage analysis aborted by user input change.');
        } else {
            console.error('Fetch Error:', error);
            alert('Could not connect to the backend server. If you are offline, ensure your local Flask app is running.');
        }
    } finally {
        if (window.globalTriageController && !window.globalTriageController.signal.aborted) {
            checkSeverityBtn.textContent = originalText;
            checkSeverityBtn.disabled = true;
            setTimeout(() => { updateButtonStatus(); }, 10000);
        }
    }
});

// Setup Triage Auto-Cancellation
const abortTriage = () => {
    if (window.globalTriageController) {
        window.globalTriageController.abort();
        window.globalTriageController = null;
        checkSeverityBtn.textContent = 'Analyze Severity';
        checkSeverityBtn.disabled = false;
        document.getElementById('result-overlay').classList.add('hidden');
        const aiText = document.getElementById('ai-text-triage');
        if (aiText && aiText.typingTimeout) clearTimeout(aiText.typingTimeout);
        if (aiText) aiText.textContent = '';
    }
};

[document.getElementById('patientName'), document.getElementById('patientAge'), document.getElementById('patientGender'), document.getElementById('spoken-symptoms'), document.getElementById('village-select')].forEach(input => {
    if (input) input.addEventListener('input', abortTriage);
});

function showResult(color, homeCare, bookLink, aiSuggestion) {
    severityBadge.textContent = `${color} PRIORITY`;
    severityBadge.className = `badge ${color.toLowerCase()}`;
    
    // AI Suggestion Injection
    if (aiSuggestion) {
        const textContainer = document.getElementById('ai-text-triage');
        document.getElementById('ai-suggestion-triage').classList.remove('hidden');
        typeEffect(textContainer, aiSuggestion);
    } else {
        document.getElementById('ai-suggestion-triage').classList.add('hidden');
    }
    
    // Use the dynamic home care instruction from backend if available
    if (homeCare) {
        severityDesc.textContent = homeCare;
    } else {
        severityDesc.textContent = severityMessages[color] || 'Standard protocol applies.';
    }
    
    // Fetch the patient name locally
    const patientName = document.getElementById('patientName').value.trim() || 'Patient';
    
    // Handle dynamic booking link
    const existingLink = document.getElementById('booking-link');
    if (existingLink) existingLink.remove();
    
    if (color === 'Yellow') {
        const linkBtn = document.createElement('button');
        linkBtn.id = 'booking-link';
        linkBtn.textContent = '📅 Schedule Local Appointment';
        linkBtn.className = 'btn-primary book-btn';
        linkBtn.style.backgroundColor = 'var(--yellow)';
        linkBtn.style.color = '#343a40'; // High contrast text on yellow background
        linkBtn.addEventListener('click', () => {
            document.getElementById('booking-title').textContent = `Booking for ${patientName}...`;
            document.getElementById('booking-overlay').classList.remove('hidden');
            resultOverlay.classList.add('hidden'); // Hide the severity overlay
        });
        severityDesc.parentNode.insertBefore(linkBtn, closeResultBtn);
    } else if (color === 'Red') {
        const linkBtn = document.createElement('a');
        linkBtn.id = 'booking-link';
        linkBtn.href = bookLink || 'https://rural-health.local/video-consult';
        linkBtn.target = '_blank'; // open in new tab
        linkBtn.textContent = '🚨 Start Quick Online Consult (Video Call)';
        linkBtn.className = 'btn-primary book-btn';
        linkBtn.style.backgroundColor = 'var(--red)';
        severityDesc.parentNode.insertBefore(linkBtn, closeResultBtn);
    }
    
    resultOverlay.classList.remove('hidden');
}

closeResultBtn.addEventListener('click', () => {
    resultOverlay.classList.add('hidden');
});

closeBookingBtn.addEventListener('click', () => {
    bookingOverlay.classList.add('hidden');
});

confirmBookingBtn.addEventListener('click', () => {
    alert('Appointment successfully booked!');
    bookingOverlay.classList.add('hidden');
});

// Handling Feedback Submission
const facilityRating = document.getElementById('facility-rating');
const urgentReportContainer = document.getElementById('urgent-report-container');

if (facilityRating) {
    facilityRating.addEventListener('change', (e) => {
        if (e.target.value === 'Worst') {
            urgentReportContainer.classList.remove('hidden');
            complaintText.required = true;
            // Add a visual flash effect to draw attention
            urgentReportContainer.style.animation = 'pulseRed 0.5s ease 1';
        } else {
            urgentReportContainer.classList.add('hidden');
            complaintText.required = false;
        }
    });
}

feedbackForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Custom Validation
    if (facilityRating.value === 'Worst' && !complaintText.value.trim()) {
        alert("Please describe the issue for the urgent report.");
        return;
    }
    
    const isHighPriority = facilityRating.value === 'Worst';
    
    const originalText = submitFeedbackBtn.textContent;
    submitFeedbackBtn.textContent = 'Submitting...';
    submitFeedbackBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                rating: facilityRating.value,
                is_high_priority: isHighPriority,
                complaint: complaintText.value,
                village: villageSelect.value 
            })
        });
        
        if (!response.ok) throw new Error('Feedback submission failed');
        
        // Success UI
        complaintText.value = '';
        facilityRating.value = '';
        urgentReportContainer.classList.add('hidden');
        feedbackSuccess.classList.remove('hidden');
        setTimeout(() => feedbackSuccess.classList.add('hidden'), 5000);
        
    } catch (error) {
        console.error('Error submitting feedback:', error);
        alert('Could not submit feedback at this time. Please make sure the server is running.');
    } finally {
        submitFeedbackBtn.textContent = originalText;
        submitFeedbackBtn.disabled = false;
    }
});

// Load Regional Health Monitor Data
async function loadMonitorData() {
    try {
        const res = await fetch(`${API_URL}/monitor`);
        if (!res.ok) throw new Error('Failed to fetch monitor data');
        const data = await res.json();
        
        // Animate count up if desired, or just set text
        document.getElementById('monitor-total').textContent = data.total_red || 0;
        
        const snakebiteNode = document.getElementById('monitor-snakebites');
        if (snakebiteNode) {
            snakebiteNode.textContent = data.total_snakebites || 0;
        }
        
        const hotspotsList = document.getElementById('monitor-hotspots');
        hotspotsList.innerHTML = '';
        
        if (data.hotspots.length === 0) {
            hotspotsList.innerHTML = '<li style="color: var(--green);">No active red cases reported.</li>';
        } else {
            data.hotspots.forEach(spot => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${spot.village}</strong>: ${spot.count} cases`;
                hotspotsList.appendChild(li);
            });
        }
    } catch (e) {
        console.error("Monitor fetch error:", e);
    }
}

// Call on initial load
window.addEventListener('load', loadMonitorData);

// --- Snakebite Module Logic (4th Pillar) ---
const sbSubmitBtn = document.getElementById('sb-submit-btn');
let globalSnakebiteController = null;

const sbInputs = [
    document.getElementById('sb-name'), document.getElementById('sb-age'), document.getElementById('sb-gender'),
    document.getElementById('sb-type'), document.getElementById('sb-time'), document.getElementById('sb-symptoms')
];
sbInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            if (globalSnakebiteController) {
                globalSnakebiteController.abort();
                globalSnakebiteController = null;
                sbSubmitBtn.textContent = 'Get Life-Saving Advice';
                sbSubmitBtn.disabled = false;
                document.getElementById('sb-result').classList.add('hidden');
                const textContainer = document.getElementById('ai-text-snakebite');
                if (textContainer && textContainer.typingTimeout) clearTimeout(textContainer.typingTimeout);
                if (textContainer) textContainer.textContent = '';
            }
        });
    }
});

if (sbSubmitBtn) {
    sbSubmitBtn.addEventListener('click', async () => {
        const name = document.getElementById('sb-name').value.trim();
        const age = document.getElementById('sb-age').value.trim();
        const gender = document.getElementById('sb-gender').value;
        const type = document.getElementById('sb-type').value;
        const time = document.getElementById('sb-time').value;
        const symptoms = document.getElementById('sb-symptoms').value.trim();
        
        if (!name || !age || !gender || !time || !symptoms) {
            alert("Please fill in all details (Name, Age, Gender, Time, Symptoms) for the most accurate life-saving advice.");
            return;
        }
        
        const originalText = 'Get Life-Saving Advice';
        sbSubmitBtn.textContent = 'Analyzing Emergency...';
        sbSubmitBtn.disabled = true;
        
        if (globalSnakebiteController) globalSnakebiteController.abort();
        globalSnakebiteController = new AbortController();
        const signal = globalSnakebiteController.signal;
        
        try {
            const response = await fetch(`${API_URL}/triage/snakebite`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name, age, gender, village: villageSelect ? villageSelect.value : 'Unknown', snake: type, bite_time: time, symptoms }),
                signal: signal
            });
            const data = await response.json();
            
            const sbResult = document.getElementById('sb-result');
            sbResult.classList.remove('hidden');
            
            if (data.ai_suggestion) {
                const textContainer = document.getElementById('ai-text-snakebite');
                typeEffect(textContainer, data.ai_suggestion, 20); // slightly slower deliberately for dramatic urgency
            }
            
            loadMonitorData(); // Update the Heatmap monitor immediately
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('Snakebite analysis aborted by user input change.');
            } else {
                console.error("Failed to submit snakebite SOS:", e);
            }
        } finally {
            if (globalSnakebiteController && !globalSnakebiteController.signal.aborted) {
                sbSubmitBtn.textContent = originalText;
                sbSubmitBtn.disabled = true;
                setTimeout(() => { sbSubmitBtn.disabled = false; }, 10000);
            }
        }
    });
}

// --- Pillar Navigation Logic ---
const pillarBtns = document.querySelectorAll('.pillar-btn');
const pillarContents = document.querySelectorAll('.pillar-content');
const hospitalRecText = document.getElementById('hospital-recommendation-text');

pillarBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active states
        pillarBtns.forEach(b => {
            b.classList.remove('active');
            b.style.background = '#e9ecef';
            b.style.color = '#495057';
        });
        pillarContents.forEach(c => c.classList.add('hidden'));
        
        // Add active states
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-target');
        
        let themeColor = 'var(--red)';
        if (targetId === 'pillar-general') themeColor = 'var(--blue)';
        if (targetId === 'pillar-maternity') themeColor = 'var(--pink)';
        if (targetId === 'pillar-snakebite') themeColor = '#ff4500'; // Neon Orange
        
        btn.style.background = themeColor;
        btn.style.color = 'white';
        
        document.getElementById(targetId).classList.remove('hidden');
        
        // Update Hospital Recommendation
        hospitalRecText.textContent = btn.getAttribute('data-hospital');
        hospitalRecText.style.color = themeColor;
        
        // Manage ASV Badge conditionally based on the active tab
        const asvBadge = document.getElementById('asv-badge');
        if (asvBadge) {
            if (targetId === 'pillar-snakebite') {
                asvBadge.classList.remove('hidden');
            } else {
                asvBadge.classList.add('hidden');
            }
        }
    });
});

let globalChronicController = null;

// --- General Checkup Logic ---
const checkGeneralBtn = document.getElementById('check-general-btn');
const generalInputs = [
    document.getElementById('gen-name'), document.getElementById('gen-age'), document.getElementById('gen-gender'),
    document.getElementById('bp-sys'), document.getElementById('bp-dia'), document.getElementById('blood-sugar')
];

// Cancel analysis if health inputs are modified during processing
generalInputs.forEach(input => {
    input.addEventListener('input', () => {
        if (globalChronicController) {
            globalChronicController.abort();
            globalChronicController = null;
            checkGeneralBtn.textContent = 'Save & Analyze Readings';
            document.getElementById('general-result').classList.add('hidden');
            document.getElementById('general-confirm').classList.add('hidden');
            
            // Clear AI text safely 
            const textContainer = document.getElementById('ai-text-chronic');
            if (textContainer.typingTimeout) clearTimeout(textContainer.typingTimeout);
            textContainer.textContent = '';
        }
    });
});

checkGeneralBtn.addEventListener('click', async () => {
    const name = document.getElementById('gen-name').value.trim();
    const age = document.getElementById('gen-age').value.trim();
    const gender = document.getElementById('gen-gender').value;
    
    const sysInput = document.getElementById('bp-sys');
    const diaInput = document.getElementById('bp-dia');
    const sugarInput = document.getElementById('blood-sugar');
    
    const sysValue = sysInput.value;
    const diaValue = diaInput.value;
    const sugarValue = sugarInput.value;
    
    const sys = sysValue ? parseInt(sysValue) : null;
    const dia = diaValue ? parseInt(diaValue) : null;
    const sugar = sugarValue ? parseInt(sugarValue) : null;
    
    if (!name || !age || !gender || (!sysValue && !diaValue && !sugarValue)) {
        alert("Please enter patient details and at least one health reading.");
        return;
    }
    
    // Reset parameter backgrounds
    sysInput.style.backgroundColor = 'var(--white)';
    diaInput.style.backgroundColor = 'var(--white)';
    sugarInput.style.backgroundColor = 'var(--white)';
    
    let isHigh = false;
    let isLow = false;
    
    // Process High Conditions & Colorize Inputs
    if (sys !== null && sys > 140) { sysInput.style.backgroundColor = '#ffe3e3'; isHigh = true; }
    if (dia !== null && dia > 90) { diaInput.style.backgroundColor = '#ffe3e3'; isHigh = true; }
    if (sugar !== null && sugar > 200) { sugarInput.style.backgroundColor = '#ffe3e3'; isHigh = true; }
    
    // Process Low Conditions
    if ((sys !== null && sys < 90) || (sugar !== null && sugar < 70)) {
        isLow = true;
    }
    
    let riskContext = 'Normal';
    if (isHigh) riskContext = 'High Risk';
    else if (isLow) riskContext = 'Low Levels';
    
    const originalText = 'Save & Analyze Readings';
    checkGeneralBtn.textContent = 'Analyzing...';
    checkGeneralBtn.disabled = true;
    
    // Setup AbortController for cancelation capability
    if (globalChronicController) globalChronicController.abort();
    globalChronicController = new AbortController();
    const signal = globalChronicController.signal;
    
    // Attempt Database Save & AI Gen
    try {
        const response = await fetch(`${API_URL}/triage/chronic`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, age, gender, bp_sys: sysValue, bp_dia: diaValue, sugar: sugarValue, risk_context: riskContext }),
            signal: signal
        });
        const data = await response.json();
        
        const generalConfirm = document.getElementById('general-confirm');
        generalConfirm.textContent = `✓ ${data.message || 'Health Record Updated for ' + name + '. View suggestions below.'}`;
        generalConfirm.classList.remove('hidden');
        
        if (data.ai_suggestion) {
            const textContainer = document.getElementById('ai-text-chronic');
            document.getElementById('ai-suggestion-chronic').classList.remove('hidden');
            typeEffect(textContainer, data.ai_suggestion);
        } else {
            document.getElementById('ai-suggestion-chronic').classList.add('hidden');
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Chronic analysis aborted by user input change.');
        } else {
            console.error("Failed to save chronic record:", e);
        }
    } finally {
        if (globalChronicController && !globalChronicController.signal.aborted) {
            checkGeneralBtn.textContent = originalText;
            checkGeneralBtn.disabled = true;
            setTimeout(() => { checkGeneralBtn.disabled = false; }, 10000);
        }
    }
    
    const generalResult = document.getElementById('general-result');
    const warningText = document.getElementById('general-warning');
    const planText = document.getElementById('general-plan');
    const badge = document.getElementById('chronic-badge');
    
    let warning = "Normal Readings";
    let plan = "Your readings appear to be in a standard range. Maintain a balanced diet and regular exercise.";
    
    if (badge) badge.classList.add('hidden');
    
    if (isHigh) {
        warning = "High Risk Detected";
        plan = "Elevated vitals. Please follow the AI advisory carefully and consult a doctor.";
        generalResult.style.background = '#ffe3e3';
        generalResult.style.borderColor = 'var(--red)';
        warningText.style.color = 'var(--red)';
        
        if (badge) {
            badge.textContent = 'High Risk Detected';
            badge.style.backgroundColor = 'var(--red)';
            badge.classList.remove('hidden');
        }
    } else if (isLow) {
        warning = "Low Vitals Detected";
        plan = "Vitals are dangerously low. Please follow the AI advisory for immediate action.";
        generalResult.style.background = '#eaf6ff';
        generalResult.style.borderColor = 'var(--blue)';
        warningText.style.color = 'var(--blue)';
        
        if (badge) {
            badge.textContent = 'Low Levels: Immediate Attention Required';
            badge.style.backgroundColor = 'var(--blue)';
            badge.classList.remove('hidden');
        }
    } else {
        generalResult.style.background = '#eaf6ff';
        generalResult.style.borderColor = 'var(--green)';
        warningText.style.color = 'var(--green)';
    }
    
    warningText.textContent = warning;
    planText.textContent = plan;
    generalResult.classList.remove('hidden');
});

// --- Maternity Care Logic ---
let globalMaternityController = null;
const checkMaternityBtn = document.getElementById('check-maternity-btn');

const matInputs = [
    document.getElementById('mat-name'), document.getElementById('mat-age'), 
    document.getElementById('preg-months'), document.getElementById('preg-symptoms')
];
matInputs.forEach(input => {
    if (input) {
        input.addEventListener('input', () => {
            if (globalMaternityController) {
                globalMaternityController.abort();
                globalMaternityController = null;
                checkMaternityBtn.textContent = 'Save & Review Maternal Health';
                checkMaternityBtn.disabled = false;
                document.getElementById('maternity-result').classList.add('hidden');
                document.getElementById('maternity-confirm').classList.add('hidden');
                const textContainer = document.getElementById('ai-text-maternity');
                if (textContainer && textContainer.typingTimeout) clearTimeout(textContainer.typingTimeout);
                if (textContainer) textContainer.textContent = '';
            }
        });
    }
});

const pregMonthsInput = document.getElementById('preg-months');
const pregMonthsDisplay = document.getElementById('preg-months-display');
if (pregMonthsInput && pregMonthsDisplay) {
    pregMonthsInput.addEventListener('input', (e) => {
        pregMonthsDisplay.textContent = e.target.value;
    });
}

checkMaternityBtn.addEventListener('click', async () => {
    const name = document.getElementById('mat-name').value.trim();
    const age = document.getElementById('mat-age').value.trim();
    const months = document.getElementById('preg-months').value;
    const symptoms = document.getElementById('preg-symptoms').value;
    
    if (!name || !age) {
        alert("Please enter the patient's name and age.");
        return;
    }
    
    const originalText = 'Save & Review Maternal Health';
    checkMaternityBtn.textContent = 'Analyzing...';
    checkMaternityBtn.disabled = true;
    
    if (globalMaternityController) globalMaternityController.abort();
    globalMaternityController = new AbortController();
    const signal = globalMaternityController.signal;
    
    // Attempt Database Save
    try {
        const response = await fetch(`${API_URL}/triage/maternity`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, age, months, symptoms }),
            signal: signal
        });
        const data = await response.json();
        
        const maternityConfirm = document.getElementById('maternity-confirm');
        maternityConfirm.textContent = `✓ ${data.message || 'Health Record Updated for ' + name + '. View suggestions below.'}`;
        maternityConfirm.classList.remove('hidden');
        
        if (data.ai_suggestion) {
            const textContainer = document.getElementById('ai-text-maternity');
            document.getElementById('ai-suggestion-maternity').classList.remove('hidden');
            typeEffect(textContainer, data.ai_suggestion);
        } else {
            document.getElementById('ai-suggestion-maternity').classList.add('hidden');
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('Maternity analysis aborted by user input change.');
        } else {
            console.error("Failed to save maternity record:", e);
        }
    } finally {
        if (globalMaternityController && !globalMaternityController.signal.aborted) {
            checkMaternityBtn.textContent = originalText;
            checkMaternityBtn.disabled = true;
            setTimeout(() => { checkMaternityBtn.disabled = false; }, 10000);
        }
    }
    
    const maternityResult = document.getElementById('maternity-result');
    const actionText = document.getElementById('maternity-action');
    const planText = document.getElementById('maternity-plan');
    
    actionText.textContent = "Nearest Maternity Speciality Clinic recommended.";
    planText.innerHTML = `<strong>Nutrition Routine:</strong> Increase intake of Iron-rich foods (spinach, lentils) and ensure daily Folic Acid supplements.<br><br><strong>Note:</strong> Logged symptoms (${symptoms || 'None reported'}) have been recorded for your next checkup.`;
    
    maternityResult.classList.remove('hidden');
});
