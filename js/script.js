(() => {
  'use strict';

  // ---- Preloader ----
  window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      setTimeout(() => preloader.classList.add('hide'), 300);
    }
  });

  // ---- Header scroll state + scroll progress bar ----
  const header = document.getElementById('siteHeader');
  const scrollProgress = document.getElementById('scrollProgress');
  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');

    const backToTop = document.getElementById('backToTop');
    if (window.scrollY > 500) backToTop.classList.add('show');
    else backToTop.classList.remove('show');

    if (scrollProgress) {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      scrollProgress.style.width = pct + '%';
    }
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile nav toggle ----
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  navToggle.addEventListener('click', () => {
    mainNav.classList.toggle('open');
    navToggle.classList.toggle('active');
  });
  mainNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
    });
  });

  // ---- Cursor glow ----
  const glow = document.getElementById('cursorGlow');
  if (glow) {
    document.addEventListener('mousemove', (e) => {
      glow.style.left = e.clientX + 'px';
      glow.style.top = e.clientY + 'px';
    });
  }

  // ---- Back to top ----
  document.getElementById('backToTop').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---- Scroll reveal ----
  const revealEls = document.querySelectorAll('[data-reveal]');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
  revealEls.forEach((el) => revealObserver.observe(el));

  // ---- Portfolio filter ----
  const filterBtns = document.querySelectorAll('.filter-btn');
  const portfolioItems = document.querySelectorAll('.portfolio-item');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.getAttribute('data-filter');
      portfolioItems.forEach((item) => {
        const match = filter === 'all' || item.getAttribute('data-cat') === filter;
        item.classList.toggle('hide', !match);
      });
    });
  });

  // ---- Lightbox (only present on pages with a portfolio grid) ----
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');

  if (lightbox && lightboxImg && lightboxClose) {
    portfolioItems.forEach((item) => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    const closeLightbox = () => {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
    };
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeLightbox();
    });
  }

  // ---- Flip cards (services + process steps) ----
  document.querySelectorAll('.flip-card').forEach((card) => {
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');

    const toggle = () => {
      const flipped = card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    // Let links on the back of the card (e.g. "Get Started") navigate
    // normally instead of just re-triggering the flip.
    card.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', (e) => e.stopPropagation());
    });
  });

  // ---- Quick section-jump nav (homepage only) ----
  const sectionNav = document.getElementById('sectionNav');
  if (sectionNav) {
    const navDots = Array.from(sectionNav.querySelectorAll('a'));
    const sections = navDots
      .map((a) => document.getElementById(a.getAttribute('data-section')))
      .filter(Boolean);
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navDots.forEach((a) => a.classList.toggle('active', a.getAttribute('data-section') === id));
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    sections.forEach((s) => sectionObserver.observe(s));
  }

  // ---- Shared email helper ----
  // Opens a pre-filled Gmail compose window rather than a plain "mailto:"
  // link. mailto: only works when the visitor's device has a desktop mail
  // client configured, which fails silently for most people on phones/
  // Chromebooks — going straight to Gmail's own compose URL is reliable
  // since the inbox every form sends to is a Gmail address anyway.
  const sendViaGmail = (subject, bodyText) => {
    const encSubject = encodeURIComponent(subject);
    const encBody = encodeURIComponent(bodyText);
    const mailtoUrl = `mailto:consultingcedarpoint@gmail.com?subject=${encSubject}&body=${encBody}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=consultingcedarpoint@gmail.com&su=${encSubject}&body=${encBody}`;
    const gmailTab = window.open(gmailUrl, '_blank', 'noopener');
    if (!gmailTab) {
      // Popup blocked — fall back to the OS mail handler.
      window.location.href = mailtoUrl;
    }
    return mailtoUrl;
  };

  const showConfirmation = (form, confirmation) => {
    if (!form || !confirmation) return;
    form.style.display = 'none';
    confirmation.classList.add('show');
  };

  // ---- Free audit form (audit.html) ----
  const auditForm = document.getElementById('auditForm');
  const auditConfirmation = document.getElementById('auditConfirmation');
  if (auditForm && auditConfirmation) {
    auditForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('auditName').value.trim();
      const email = document.getElementById('auditEmail').value.trim();
      const handle = document.getElementById('auditHandle').value.trim();
      const industry = document.getElementById('auditIndustry').value.trim();
      const challenge = document.getElementById('auditChallenge').value.trim();

      const body = `Name: ${name}\nEmail: ${email}\nInstagram / Website: ${handle}\nBusiness type: ${industry || '—'}\n\nBiggest challenge:\n${challenge || '—'}`;
      sendViaGmail('Free Brand Audit Request', body);
      showConfirmation(auditForm, auditConfirmation);
    });
  }

  // ---- Multi-step "Request a Quote" form (contact.html) ----
  const quoteForm = document.getElementById('quoteForm');
  const quoteConfirmation = document.getElementById('quoteConfirmation');
  if (quoteForm && quoteConfirmation) {
    // Chip selection: single-select groups keep one active chip, the
    // service group (data-multi) allows several.
    quoteForm.querySelectorAll('.chip-group').forEach((group) => {
      const multi = group.getAttribute('data-multi') === 'true';
      group.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          if (!multi) {
            group.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
          }
          chip.classList.toggle('selected');
        });
      });
    });

    const steps = Array.from(quoteForm.querySelectorAll('.quote-step'));
    const progressSteps = Array.from(document.querySelectorAll('#quoteProgress .quote-progress-step'));
    const goToStep = (n) => {
      steps.forEach((s) => s.classList.toggle('active', Number(s.getAttribute('data-step')) === n));
      progressSteps.forEach((p, i) => p.classList.toggle('active', i < n));
    };

    const nextBtn = document.getElementById('quoteNext');
    const backBtn = document.getElementById('quoteBack');
    if (nextBtn) nextBtn.addEventListener('click', () => goToStep(2));
    if (backBtn) backBtn.addEventListener('click', () => goToStep(1));

    quoteForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const selectedFrom = (groupName) =>
        Array.from(quoteForm.querySelectorAll(`.chip-group[data-group="${groupName}"] .chip.selected`))
          .map((c) => c.textContent.trim());

      const services = selectedFrom('service').join(', ') || '—';
      const budget = selectedFrom('budget')[0] || '—';
      const timeline = selectedFrom('timeline')[0] || '—';

      const name = document.getElementById('quoteName').value.trim();
      const email = document.getElementById('quoteEmail').value.trim();
      const phone = document.getElementById('quotePhone').value.trim();
      const brand = document.getElementById('quoteBrand').value.trim();
      const message = document.getElementById('quoteMessage').value.trim();

      const body =
        `Service(s) needed: ${services}\nBudget: ${budget}\nTimeline: ${timeline}\n\n` +
        `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\nBrand/Business: ${brand || '—'}\n\n` +
        `Message:\n${message || '—'}`;

      sendViaGmail('New Quote Request', body);
      showConfirmation(quoteForm, quoteConfirmation);
    });
  }

  // ---- Active nav link ----
  const currentPage = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.main-nav a').forEach((link) => {
    const linkPage = link.getAttribute('href').split('#')[0] || 'index.html';
    if (linkPage === currentPage) link.classList.add('active');
  });

  // ---- Footer year ----
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
