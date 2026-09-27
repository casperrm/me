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
      if (link.classList.contains('nav-drop-trigger') && window.innerWidth <= 992) return;
      mainNav.classList.remove('open');
      navToggle.classList.remove('active');
    });
  });

  // ---- Services nav dropdown ----
  document.querySelectorAll('.nav-item-dropdown > .nav-drop-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      if (window.innerWidth <= 992) {
        e.preventDefault();
        trigger.closest('.nav-item-dropdown').classList.toggle('open');
      }
    });
  });
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item-dropdown.open').forEach((item) => {
      if (!item.contains(e.target)) item.classList.remove('open');
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

  // ---- Scroll reveal (cards/sections fade up; headline text nested inside
  // them opens from center via the same .in-view class, see CSS) ----
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
  // Grouped items (data-images="a.jpg|b.jpg|c.jpg") open as a mini
  // carousel with prev/next + a slide counter; single-image items just
  // show the one photo with the controls hidden.
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');
  const lightboxCounter = document.getElementById('lightboxCounter');

  if (lightbox && lightboxImg && lightboxClose) {
    let currentImages = [];
    let currentIndex = 0;

    const showSlide = (i) => {
      currentIndex = (i + currentImages.length) % currentImages.length;
      lightboxImg.src = currentImages[currentIndex];
      const multi = currentImages.length > 1;
      if (lightboxPrev) lightboxPrev.hidden = !multi;
      if (lightboxNext) lightboxNext.hidden = !multi;
      if (lightboxCounter) {
        lightboxCounter.hidden = !multi;
        lightboxCounter.textContent = `${currentIndex + 1} / ${currentImages.length}`;
      }
    };

    portfolioItems.forEach((item) => {
      item.addEventListener('click', () => {
        const groupAttr = item.getAttribute('data-images');
        const img = item.querySelector('img');
        currentImages = groupAttr ? groupAttr.split('|') : [img.src];
        lightboxImg.alt = img.alt;
        showSlide(0);
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
    if (lightboxPrev) lightboxPrev.addEventListener('click', () => showSlide(currentIndex - 1));
    if (lightboxNext) lightboxNext.addEventListener('click', () => showSlide(currentIndex + 1));
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('open')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showSlide(currentIndex - 1);
      if (e.key === 'ArrowRight') showSlide(currentIndex + 1);
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

  // ---- Shared inquiry submission ----
  // Submits form data directly to consultingcedarpoint@gmail.com via
  // Web3Forms (https://web3forms.com), a form backend built for static
  // sites like this one (no server of our own required). The access key
  // below is a public, domain-scoped site identifier, like a site ID,
  // not a secret. It cannot read mail, send as consultingcedarpoint@
  // gmail.com, or be used for anything beyond delivering these specific
  // forms, so it's safe to ship in frontend code.
  //
  // SETUP (one-time, ~60 seconds): go to https://web3forms.com, enter
  // consultingcedarpoint@gmail.com (no account or password needed), and
  // paste the access key it emails you in place of the placeholder below.
  // Until that's done, every form on the site will show a clear error
  // instead of silently pretending to send.
  const WEB3FORMS_ACCESS_KEY = 'YOUR_WEB3FORMS_ACCESS_KEY';
  const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

  const submitInquiry = async (subject, fields) => {
    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY === 'YOUR_WEB3FORMS_ACCESS_KEY') {
      throw new Error('not-configured');
    }
    const res = await fetch(WEB3FORMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_ACCESS_KEY,
        subject,
        from_name: 'CedarPoint Media website',
        ...fields,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || 'send-failed');
    return data;
  };

  const setButtonLoading = (btn, loading) => {
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
  };

  const showFormError = (el, message) => {
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
  };

  const clearFormError = (el) => {
    if (!el) return;
    el.textContent = '';
    el.classList.remove('show');
  };

  const GENERIC_SEND_ERROR = "Something went wrong sending your request. Please try again, or reach us directly on WhatsApp or by email. We're happy to help either way.";

  const showConfirmation = (form, confirmation) => {
    if (!form || !confirmation) return;
    form.style.display = 'none';
    confirmation.classList.add('show');
  };

  // ---- Free audit form (audit.html) ----
  const auditForm = document.getElementById('auditForm');
  const auditConfirmation = document.getElementById('auditConfirmation');
  const auditFormError = document.getElementById('auditFormError');
  if (auditForm && auditConfirmation) {
    auditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(auditFormError);
      const name = document.getElementById('auditName').value.trim();
      const email = document.getElementById('auditEmail').value.trim();
      const handle = document.getElementById('auditHandle').value.trim();
      const industry = document.getElementById('auditIndustry').value.trim();
      const challenge = document.getElementById('auditChallenge').value.trim();

      const body = `Name: ${name}\nEmail: ${email}\nInstagram / Website: ${handle}\nBusiness type: ${industry || 'N/A'}\n\nBiggest challenge:\n${challenge || 'N/A'}`;
      const submitBtn = document.getElementById('auditSubmitBtn');
      setButtonLoading(submitBtn, true);
      try {
        await submitInquiry('Free Brand Audit Request: CedarPoint Media', { name, email, message: body });
        showConfirmation(auditForm, auditConfirmation);
      } catch (err) {
        showFormError(auditFormError, GENERIC_SEND_ERROR);
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // ---- Multi-step "Request a Quote" form (contact.html) ----
  const quoteForm = document.getElementById('quoteForm');
  const quoteConfirmation = document.getElementById('quoteConfirmation');
  const quoteFormError = document.getElementById('quoteFormError');
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

    // Pre-select a package when arriving from a pricing card's "Get
    // Started" link (contact.html?package=basic|standard|premium).
    const packageParam = new URLSearchParams(window.location.search).get('package');
    if (packageParam) {
      const chip = quoteForm.querySelector(`.chip-group[data-group="package"] .chip[data-value="${packageParam}"]`);
      if (chip) {
        chip.classList.add('selected');
        setTimeout(() => chip.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400);
      }
    }

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

    quoteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(quoteFormError);

      const selectedFrom = (groupName) =>
        Array.from(quoteForm.querySelectorAll(`.chip-group[data-group="${groupName}"] .chip.selected`))
          .map((c) => c.textContent.trim());

      const services = selectedFrom('service').join(', ') || 'N/A';
      const packageChoice = selectedFrom('package')[0] || 'N/A';
      const timeline = selectedFrom('timeline')[0] || 'N/A';
      const contactPref = selectedFrom('contactPref')[0] || 'N/A';

      const name = document.getElementById('quoteName').value.trim();
      const email = document.getElementById('quoteEmail').value.trim();
      const phone = document.getElementById('quotePhone').value.trim();
      const brand = document.getElementById('quoteBrand').value.trim();
      const country = document.getElementById('quoteCountry').value.trim();
      const industry = document.getElementById('quoteIndustry').value.trim();
      const social = document.getElementById('quoteSocial').value.trim();
      const goals = document.getElementById('quoteGoals').value.trim();
      const start = document.getElementById('quoteStart').value.trim();

      const body =
        `Service needed: ${services}\nPackage: ${packageChoice}\nTimeline: ${timeline}\n\n` +
        `Business / brand name: ${brand || 'N/A'}\nCountry: ${country}\nIndustry: ${industry || 'N/A'}\nSocial accounts / website: ${social || 'N/A'}\n\n` +
        `Project description:\n${goals || 'N/A'}\n\n` +
        `Name: ${name}\nEmail: ${email}\nPhone / WhatsApp: ${phone || 'N/A'}\nPreferred start date: ${start || 'N/A'}\nPreferred contact method: ${contactPref}`;

      const submitBtn = document.getElementById('quoteSubmitBtn');
      setButtonLoading(submitBtn, true);
      try {
        await submitInquiry('New Quote Request: CedarPoint Media', {
          name, email, phone, country, package: packageChoice, service: services, message: body,
        });
        showConfirmation(quoteForm, quoteConfirmation);
      } catch (err) {
        showFormError(quoteFormError, GENERIC_SEND_ERROR);
      } finally {
        setButtonLoading(submitBtn, false);
      }
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
  const consultFormError = document.getElementById('consultFormError');
  if (consultForm && consultConfirmation) {
    consultForm.querySelectorAll('.chip-group').forEach((group) => {
      group.querySelectorAll('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          group.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.toggle('selected');
        });
      });
    });

    consultForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError(consultFormError);

      const selectedFrom = (groupName) =>
        Array.from(consultForm.querySelectorAll(`.chip-group[data-group="${groupName}"] .chip.selected`))
          .map((c) => c.textContent.trim());

      const name = document.getElementById('consultName').value.trim();
      const email = document.getElementById('consultEmail').value.trim();
      const phone = document.getElementById('consultPhone').value.trim();
      const date = document.getElementById('consultDate').value.trim();
      const timeWindow = selectedFrom('timeWindow')[0] || 'N/A';
      const contactPref = selectedFrom('consultContactPref')[0] || 'N/A';
      const topic = document.getElementById('consultTopic').value.trim();

      const body =
        `Preferred date: ${date || 'N/A'}\nPreferred time: ${timeWindow}\nPreferred contact method: ${contactPref}\n\n` +
        `Name: ${name}\nEmail: ${email}\nPhone / WhatsApp: ${phone}\n\n` +
        `What they'd like to discuss:\n${topic || 'N/A'}`;

      const submitBtn = document.getElementById('consultSubmitBtn');
      setButtonLoading(submitBtn, true);
      try {
        await submitInquiry('Consultation Request: CedarPoint Media', { name, email, phone, message: body });
        showConfirmation(consultForm, consultConfirmation);
      } catch (err) {
        showFormError(consultFormError, GENERIC_SEND_ERROR);
      } finally {
        setButtonLoading(submitBtn, false);
      }
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
  // Recommendation copy lives on each option as data-rec-title/text/service/pkg
  // (not a hardcoded JS lookup) so the same script works on every language's page.
  const selectorGrid = document.getElementById('selectorGrid');
  const selectorResult = document.getElementById('selectorResult');
  if (selectorGrid && selectorResult) {
    const options = Array.from(selectorGrid.querySelectorAll('.selector-option'));
    const resultTitle = document.getElementById('selectorResultTitle');
    const resultText = document.getElementById('selectorResultText');
    const serviceLink = document.getElementById('selectorServiceLink');
    const pkgLink = document.getElementById('selectorPackageLink');

    options.forEach((opt) => {
      opt.addEventListener('click', () => {
        options.forEach((o) => o.classList.remove('selected'));
        opt.classList.add('selected');

        resultTitle.textContent = opt.getAttribute('data-rec-title') || '';
        resultText.textContent = opt.getAttribute('data-rec-text') || '';
        serviceLink.href = opt.getAttribute('data-rec-service') || 'services.html';
        pkgLink.href = opt.getAttribute('data-rec-pkg') || 'packages.html';
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
        title: 'Black Charge: Launch Concept',
        img: 'assets/images/work-drink-boost.jpg',
        project: 'A concept launch campaign for Black Charge, a new energy drink line, built to demonstrate a full product-ad system.',
        objective: 'Design scroll-stopping product ads ready for Instagram and TikTok placement.',
        direction: 'Two ad variants (a bold hero shot and a playful "fuel gauge" concept) anchored to one consistent brand system.',
        deliverables: '2 finished ad creatives, packaging integration, platform-ready exports.',
        result: 'This is a concept project created to demonstrate our process, not a paid client campaign. Real performance results will be added here once this work runs as a live, paid campaign.',
      },
      'growth-carousel': {
        category: 'Social Carousel',
        title: 'The Five-Slide Growth Carousel',
        img: 'assets/images/work-carousel-idea.jpg',
        project: 'A sample Instagram carousel built to show how a process can be turned into shareable, swipeable content.',
        objective: 'Turn a process into a carousel people actually read to the end, not just swipe past.',
        direction: 'A 5-slide system with one visual language: each slide standalone, all five building toward a clear CTA.',
        deliverables: '5-slide carousel, matching cover design, caption copy.',
        result: 'This is a demonstration project, not a paid client campaign. Real reach and engagement numbers will be added once this format runs for an actual client.',
      },
      'trend-marketing': {
        category: 'Trend Marketing',
        title: 'Trend-Style Meme Marketing',
        img: 'assets/images/work-kermit-trends.jpg',
        project: 'A sample set showing how a recognizable, relatable format can be adapted into on-brand marketing.',
        objective: 'Show that trend-style content can carry a real marketing message without feeling forced.',
        direction: 'Paired a familiar format with copy written for real small-business pain points, in English and Arabic.',
        deliverables: '6-piece ad set, bilingual copy versions.',
        result: 'This is concept and sample work created to demonstrate our creative range, not a paid client campaign. Client results will be added here as they launch.',
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
