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
      const contactPref = selectedFrom('contactPref')[0] || '—';

      const name = document.getElementById('quoteName').value.trim();
      const email = document.getElementById('quoteEmail').value.trim();
      const phone = document.getElementById('quotePhone').value.trim();
      const brand = document.getElementById('quoteBrand').value.trim();
      const industry = document.getElementById('quoteIndustry').value.trim();
      const social = document.getElementById('quoteSocial').value.trim();
      const goals = document.getElementById('quoteGoals').value.trim();
      const start = document.getElementById('quoteStart').value.trim();

      const body =
        `Service(s) needed: ${services}\nBudget: ${budget}\nTimeline: ${timeline}\n\n` +
        `Business name: ${brand || '—'}\nIndustry: ${industry || '—'}\nSocial accounts / website: ${social || '—'}\n\n` +
        `Goals:\n${goals || '—'}\n\n` +
        `Name: ${name}\nEmail: ${email}\nPhone: ${phone || '—'}\nPreferred start date: ${start || '—'}\nPreferred contact method: ${contactPref}`;

      sendViaGmail('New Quote Request', body);
      showConfirmation(quoteForm, quoteConfirmation);
    });
  }

  // ---- Mode tabs: "Request a Quote" vs "Book a Consultation" (contact.html) ----
  const modeTabs = document.getElementById('modeTabs');
  if (modeTabs) {
    const tabs = Array.from(modeTabs.querySelectorAll('.mode-tab'));
    const panels = Array.from(document.querySelectorAll('.mode-panel'));
    const activateMode = (mode) => {
      tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-mode') === mode));
      panels.forEach((p) => p.classList.toggle('active', p.getAttribute('data-mode-panel') === mode));
    };
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => activateMode(tab.getAttribute('data-mode')));
    });
    if (window.location.hash === '#book' || window.location.hash === '#consultation-mode') {
      activateMode('consultation');
    }
  }

  // ---- "Book a Consultation" form (contact.html) ----
  const consultForm = document.getElementById('consultForm');
  const consultConfirmation = document.getElementById('consultConfirmation');
  if (consultForm && consultConfirmation) {
    consultForm.querySelectorAll('.chip-group').forEach((group) => {
      group.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          group.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.toggle('selected');
        });
      });
    });

    consultForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const selectedFrom = (groupName) =>
        Array.from(consultForm.querySelectorAll(`.chip-group[data-group="${groupName}"] .chip.selected`))
          .map((c) => c.textContent.trim());

      const name = document.getElementById('consultName').value.trim();
      const email = document.getElementById('consultEmail').value.trim();
      const phone = document.getElementById('consultPhone').value.trim();
      const date = document.getElementById('consultDate').value.trim();
      const timeWindow = selectedFrom('timeWindow')[0] || '—';
      const contactPref = selectedFrom('consultContactPref')[0] || '—';
      const topic = document.getElementById('consultTopic').value.trim();

      const body =
        `Preferred date: ${date || '—'}\nPreferred time: ${timeWindow}\nPreferred contact method: ${contactPref}\n\n` +
        `Name: ${name}\nEmail: ${email}\nPhone / WhatsApp: ${phone}\n\n` +
        `What they'd like to discuss:\n${topic || '—'}`;

      sendViaGmail('Consultation Request', body);
      showConfirmation(consultForm, consultConfirmation);
    });
  }

  // ---- FAQ accordion (contact.html) ----
  const faqList = document.getElementById('faqList');
  if (faqList) {
    const faqItems = Array.from(faqList.querySelectorAll('.faq-item'));
    faqItems.forEach((item) => {
      const question = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        faqItems.forEach((other) => {
          other.classList.remove('open');
          other.querySelector('.faq-answer').style.maxHeight = '';
        });
        if (!isOpen) {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  }

  // ---- Interactive service selector (index.html) ----
  const selectorGrid = document.getElementById('selectorGrid');
  const selectorResult = document.getElementById('selectorResult');
  if (selectorGrid && selectorResult) {
    const recommendations = {
      branding: {
        title: 'Sounds like Brand Strategy is your fit.',
        text: 'Start with our Brand & Growth Strategy service — usually paired with the Growth package once your direction is set.',
        service: 'services.html',
        pkg: 'packages.html#growth',
      },
      social: {
        title: 'Sounds like Social Media Management is your fit.',
        text: 'Consistent posting and community management, built into every package — Starter is the easiest place to begin.',
        service: 'services.html',
        pkg: 'packages.html#starter',
      },
      content: {
        title: 'Sounds like Creative Content & Design is your fit.',
        text: 'Graphics, reels, and campaign creative — included from Starter up, with more volume in Growth.',
        service: 'services.html',
        pkg: 'packages.html#starter',
      },
      ads: {
        title: 'Sounds like Paid Social & Ad Campaigns is your fit.',
        text: 'Targeted ad management is built into Growth, with full campaign management in Premium.',
        service: 'services.html',
        pkg: 'packages.html#growth',
      },
      design: {
        title: 'Sounds like Product & Campaign Shoots is your fit.',
        text: 'Photography, print, and visual design — great as a standalone request or layered onto any package.',
        service: 'services.html',
        pkg: 'packages.html#starter',
      },
      full: {
        title: 'Sounds like Full Marketing Support is your fit.',
        text: 'Strategy, content, ads, and reporting handled end to end — that\'s exactly what Premium is built for.',
        service: 'services.html',
        pkg: 'packages.html#premium',
      },
    };

    const options = Array.from(selectorGrid.querySelectorAll('.selector-option'));
    const resultTitle = document.getElementById('selectorResultTitle');
    const resultText = document.getElementById('selectorResultText');
    const serviceLink = document.getElementById('selectorServiceLink');
    const pkgLink = document.getElementById('selectorPackageLink');

    options.forEach((opt) => {
      opt.addEventListener('click', () => {
        options.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');

        const rec = recommendations[opt.getAttribute('data-need')];
        if (!rec) return;
        resultTitle.textContent = rec.title;
        resultText.textContent = rec.text;
        serviceLink.href = rec.service;
        pkgLink.href = rec.pkg;
        selectorResult.classList.add('show');
      });
    });
  }

  // ---- Case study modal (work.html) ----
  const csModal = document.getElementById('csModal');
  if (csModal) {
    const caseStudies = {
      'black-charge': {
        category: 'Product Ads',
        title: 'Black Charge — Launch Concept',
        img: 'assets/images/work-drink-boost.jpg',
        project: 'A concept launch campaign for Black Charge, a new energy drink line, built to demonstrate a full product-ad system.',
        objective: 'Design scroll-stopping product ads ready for Instagram and TikTok placement.',
        direction: 'Two ad variants — a bold hero shot and a playful "fuel gauge" concept — anchored to one consistent brand system.',
        deliverables: '2 finished ad creatives, packaging integration, platform-ready exports.',
        result: 'This is a concept project created to demonstrate our process, not a paid client campaign — real performance results will be added here once this work runs as a live, paid campaign.',
      },
      'growth-carousel': {
        category: 'Social Carousel',
        title: 'The Five-Slide Growth Carousel',
        img: 'assets/images/work-carousel-idea.jpg',
        project: 'A sample Instagram carousel built to show how a process can be turned into shareable, swipeable content.',
        objective: 'Turn a process into a carousel people actually read to the end, not just swipe past.',
        direction: 'A 5-slide system with one visual language — each slide standalone, all five building toward a clear CTA.',
        deliverables: '5-slide carousel, matching cover design, caption copy.',
        result: 'This is a demonstration project, not a paid client campaign — real reach and engagement numbers will be added once this format runs for an actual client.',
      },
      'trend-marketing': {
        category: 'Trend Marketing',
        title: 'Trend-Style Meme Marketing',
        img: 'assets/images/work-kermit-trends.jpg',
        project: 'A sample set showing how a recognizable, relatable format can be adapted into on-brand marketing.',
        objective: 'Show that trend-style content can carry a real marketing message without feeling forced.',
        direction: 'Paired a familiar format with copy written for real small-business pain points, in English and Arabic.',
        deliverables: '4-piece ad set, bilingual copy versions.',
        result: 'This is concept and sample work created to demonstrate our creative range — not a paid client campaign. Client results will be added here as they launch.',
      },
    };

    const csImg = document.getElementById('csModalImg');
    const csCategory = document.getElementById('csModalCategory');
    const csTitle = document.getElementById('csModalTitle');
    const csProject = document.getElementById('csModalProject');
    const csObjective = document.getElementById('csModalObjective');
    const csDirection = document.getElementById('csModalDirection');
    const csDeliverables = document.getElementById('csModalDeliverables');
    const csResult = document.getElementById('csModalResult');
    const csClose = document.getElementById('csModalClose');

    const openCaseStudy = (id) => {
      const cs = caseStudies[id];
      if (!cs) return;
      csImg.src = cs.img;
      csImg.alt = cs.title;
      csCategory.textContent = cs.category;
      csTitle.textContent = cs.title;
      csProject.textContent = cs.project;
      csObjective.textContent = cs.objective;
      csDirection.textContent = cs.direction;
      csDeliverables.textContent = cs.deliverables;
      csResult.textContent = cs.result;
      csModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    };

    const closeCaseStudy = () => {
      csModal.classList.remove('open');
      document.body.style.overflow = '';
    };

    document.querySelectorAll('.cs-trigger').forEach((card) => {
      card.addEventListener('click', () => openCaseStudy(card.getAttribute('data-cs-id')));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openCaseStudy(card.getAttribute('data-cs-id'));
        }
      });
    });

    csClose.addEventListener('click', closeCaseStudy);
    csModal.addEventListener('click', (e) => {
      if (e.target === csModal) closeCaseStudy();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCaseStudy();
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
