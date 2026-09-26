// ---- Cedar Point Media — Web Development Client Intake ----
// Self-contained, no external dependencies. Flow: welcome -> steps 1-5
// -> review -> WhatsApp handoff -> confirmation.
(() => {
  'use strict';

  const WHATSAPP_NUMBER = '96181113001'; // +961 81 113 001
  const STORAGE_KEY = 'cpm_web_intake_v1';

  const SCREEN_ORDER = ['welcome', '1', '2', '3', '4', '5', 'review', 'confirmation'];
  const TOTAL_STEPS = 5;

  const REVIEW_SECTIONS = [
    {
      title: 'Contact Information',
      step: 1,
      fields: [
        { name: 'fullName', label: 'Full Name' },
        { name: 'businessName', label: 'Business / Brand Name' },
        { name: 'email', label: 'Email' },
        { name: 'phone', label: 'Phone / WhatsApp' },
        { name: 'country', label: 'Country' },
      ],
    },
    {
      title: 'Project Overview',
      step: 2,
      fields: [
        { name: 'hasWebsite', label: 'Existing website' },
        { name: 'websiteType', label: 'Website type' },
        { name: 'mainGoal', label: 'Main goal' },
        { name: 'pageCount', label: 'Pages needed' },
      ],
    },
    {
      title: 'Design & Content',
      step: 3,
      fields: [
        { name: 'logoStatus', label: 'Logo & branding' },
        { name: 'contentStatus', label: 'Content / text' },
        { name: 'imagesStatus', label: 'Photos / images' },
        { name: 'inspiration', label: 'Inspiration', optional: true },
      ],
    },
    {
      title: 'Features & Budget',
      step: 4,
      fields: [
        { name: 'features', label: 'Features needed', multi: true },
        { name: 'budget', label: 'Budget range' },
      ],
    },
    {
      title: 'Timeline & Notes',
      step: 5,
      fields: [
        { name: 'timeline', label: 'Timeline' },
        { name: 'contactMethod', label: 'Preferred contact' },
        { name: 'notes', label: 'Additional notes', optional: true },
      ],
    },
  ];

  const form = document.getElementById('intakeForm');
  const progressWrap = document.getElementById('intakeProgress');
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressStepLabel');
  const reviewContent = document.getElementById('reviewContent');
  const openWhatsAppBtn = document.getElementById('openWhatsAppBtn');
  const toast = document.getElementById('intakeToast');
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  let currentKey = 'welcome';
  let toastTimer = null;

  // ---------------------------------------------------------------
  // Screen navigation
  // ---------------------------------------------------------------
  function screenElFor(key) {
    if (key === 'welcome' || key === 'review' || key === 'confirmation') {
      return form.querySelector(`.intake-screen[data-screen="${key}"]`);
    }
    return form.querySelector(`.intake-screen[data-screen="step"][data-step="${key}"]`);
  }

  function showScreen(key) {
    form.querySelectorAll('.intake-screen').forEach((s) => s.classList.remove('active'));
    const el = screenElFor(key);
    if (el) el.classList.add('active');
    currentKey = key;

    const stepNum = Number(key);
    if (Number.isInteger(stepNum) && stepNum >= 1 && stepNum <= TOTAL_STEPS) {
      progressWrap.hidden = false;
      progressFill.style.width = `${(stepNum / TOTAL_STEPS) * 100}%`;
      progressLabel.textContent = `Step ${stepNum} of ${TOTAL_STEPS}`;
    } else {
      progressWrap.hidden = true;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goRelative(direction) {
    const idx = SCREEN_ORDER.indexOf(currentKey);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= SCREEN_ORDER.length) return;
    showScreen(SCREEN_ORDER[nextIdx]);
  }

  function goToStep(stepNum) {
    showScreen(String(stepNum));
  }

  // ---------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------
  function fieldGroupValid(group) {
    const radios = group.querySelectorAll('input[type="radio"]');
    const checkboxes = group.querySelectorAll('input[type="checkbox"]');
    const textInput = group.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea');

    if (radios.length) {
      return Array.from(radios).some((r) => r.checked);
    }
    if (checkboxes.length) {
      const anyRequired = Array.from(checkboxes).some((c) => c.hasAttribute('required')) ||
        group.querySelector('.field-label .req') !== null;
      if (!anyRequired) return true;
      return Array.from(checkboxes).some((c) => c.checked);
    }
    if (textInput) {
      if (!textInput.hasAttribute('required')) return true;
      if (textInput.type === 'email') return textInput.value.trim() !== '' && textInput.checkValidity();
      return textInput.value.trim() !== '';
    }
    return true;
  }

  function setGroupError(group, hasError) {
    group.classList.toggle('has-error', hasError);
  }

  function validateStep(stepNum) {
    const stepEl = screenElFor(String(stepNum));
    const groups = Array.from(stepEl.querySelectorAll('.field-group[data-field]'));
    let firstInvalid = null;
    groups.forEach((group) => {
      const valid = fieldGroupValid(group);
      setGroupError(group, !valid);
      if (!valid && !firstInvalid) firstInvalid = group;
    });
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = firstInvalid.querySelector('input, textarea');
      if (focusable) setTimeout(() => focusable.focus({ preventScroll: true }), 300);
      return false;
    }
    return true;
  }

  // Clear error state live as the visitor fixes a field.
  form.addEventListener('input', (e) => {
    const group = e.target.closest('.field-group');
    if (group && group.classList.contains('has-error') && fieldGroupValid(group)) {
      setGroupError(group, false);
    }
  });
  form.addEventListener('change', (e) => {
    const group = e.target.closest('.field-group');
    if (group && fieldGroupValid(group)) setGroupError(group, false);
  });

  // ---------------------------------------------------------------
  // Data collection
  // ---------------------------------------------------------------
  function collectData() {
    const fd = new FormData(form);
    const data = {};
    REVIEW_SECTIONS.forEach((section) => {
      section.fields.forEach((f) => {
        data[f.name] = f.multi ? fd.getAll(f.name) : (fd.get(f.name) || '').toString().trim();
      });
    });
    return data;
  }

  function formatValue(data, f) {
    const val = data[f.name];
    if (f.multi) return Array.isArray(val) && val.length ? val.join(', ') : '—';
    return val && val !== '' ? val : '—';
  }

  // ---------------------------------------------------------------
  // Review screen
  // ---------------------------------------------------------------
  function renderReview() {
    const data = collectData();
    reviewContent.innerHTML = '';
    REVIEW_SECTIONS.forEach((section) => {
      const secEl = document.createElement('div');
      secEl.className = 'review-section';

      const head = document.createElement('div');
      head.className = 'review-section-head';
      head.innerHTML = `<h3>${section.title}</h3>`;
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'review-edit-btn';
      editBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-edit"></use></svg> Edit';
      editBtn.addEventListener('click', () => goToStep(section.step));
      head.appendChild(editBtn);
      secEl.appendChild(head);

      const dl = document.createElement('dl');
      section.fields.forEach((f) => {
        const row = document.createElement('div');
        row.className = 'review-row';
        row.innerHTML = `<dt>${f.label}</dt><dd>${escapeHtml(formatValue(data, f))}</dd>`;
        dl.appendChild(row);
      });
      secEl.appendChild(dl);
      reviewContent.appendChild(secEl);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------
  // WhatsApp message + handoff
  // ---------------------------------------------------------------
  function buildWhatsAppMessage(data) {
    const lines = ['*New Website Project Inquiry*', '_via Cedar Point Media — Web Intake Form_', ''];
    REVIEW_SECTIONS.forEach((section) => {
      lines.push(`*${section.title}*`);
      section.fields.forEach((f) => {
        lines.push(`${f.label}: ${formatValue(data, f)}`);
      });
      lines.push('');
    });
    return lines.join('\n').trim();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
  }

  function submitViaWhatsApp() {
    const data = collectData();
    const message = buildWhatsAppMessage(data);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

    openWhatsAppBtn.href = url;

    const win = window.open(url, '_blank', 'noopener');
    showScreen('confirmation');

    if (!win) {
      showToast('Your browser blocked the pop-up — tap "Open WhatsApp Again" below to send your message.');
    }

    clearSavedProgress();
  }

  // ---------------------------------------------------------------
  // localStorage progress save (field values only — reload-safe,
  // not a tracking mechanism; cleared on submit or restart)
  // ---------------------------------------------------------------
  function saveProgress() {
    try {
      const fd = new FormData(form);
      const plain = {};
      for (const [key, value] of fd.entries()) {
        if (plain[key] === undefined) plain[key] = [];
        plain[key].push(value);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plain));
    } catch (e) { /* private mode or storage full — safe to ignore */ }
  }

  function restoreProgress() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) { saved = null; }
    if (!saved) return;

    Object.keys(saved).forEach((name) => {
      const values = saved[name];
      const els = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
      els.forEach((el) => {
        if (el.type === 'checkbox' || el.type === 'radio') {
          el.checked = values.includes(el.value);
        } else {
          el.value = values[0] || '';
        }
      });
    });
  }

  function clearSavedProgress() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  form.addEventListener('input', saveProgress);
  form.addEventListener('change', saveProgress);

  function resetForm() {
    form.reset();
    form.querySelectorAll('.field-group.has-error').forEach((g) => g.classList.remove('has-error'));
    clearSavedProgress();
    showScreen('welcome');
  }

  // ---------------------------------------------------------------
  // Button wiring (event delegation on the form)
  // ---------------------------------------------------------------
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');

    if (action === 'start') {
      goToStep(1);
    } else if (action === 'next') {
      const stepNum = Number(currentKey);
      if (validateStep(stepNum)) goRelative(1);
    } else if (action === 'review') {
      const stepNum = Number(currentKey);
      if (validateStep(stepNum)) {
        renderReview();
        showScreen('review');
      }
    } else if (action === 'back') {
      goRelative(-1);
    } else if (action === 'submit') {
      submitViaWhatsApp();
    } else if (action === 'restart') {
      resetForm();
    }
  });

  // Prevent native form submission (Enter key in a text field, etc.) —
  // navigation is entirely button/JS-driven.
  form.addEventListener('submit', (e) => e.preventDefault());

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  restoreProgress();
  showScreen('welcome');
})();
