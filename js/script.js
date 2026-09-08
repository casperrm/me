(() => {
  'use strict';

  // ---- Preloader ----
  window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
      setTimeout(() => preloader.classList.add('hide'), 300);
    }
  });

  // ---- Header scroll state ----
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (window.scrollY > 40) header.classList.add('scrolled');
    else header.classList.remove('scrolled');

    const backToTop = document.getElementById('backToTop');
    if (window.scrollY > 500) backToTop.classList.add('show');
    else backToTop.classList.remove('show');
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

  // ---- Animated counters ----
  const counters = document.querySelectorAll('.stat-num');
  const animateCounter = (el) => {
    const target = parseFloat(el.getAttribute('data-count'));
    const decimals = parseInt(el.getAttribute('data-decimal') || '0', 10);
    const duration = 1600;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = target * eased;
      el.textContent = decimals ? value.toFixed(decimals) : Math.floor(value);
      if (progress < 1) requestAnimationFrame(tick);
      else el.textContent = decimals ? target.toFixed(decimals) : target;
    };
    requestAnimationFrame(tick);
  };
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach((el) => counterObserver.observe(el));

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

  // ---- Contact form (only present on the contact page) ----
  // Opens a pre-filled Gmail compose window rather than a plain "mailto:" link.
  // mailto: only works when the visitor's device has a desktop mail client
  // configured, which fails silently for most people on phones/Chromebooks —
  // going straight to Gmail's own compose URL is reliable since the inbox
  // this form sends to is a Gmail address anyway.
  const contactForm = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');
  if (contactForm && formNote) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const service = document.getElementById('service').value;
      const message = document.getElementById('message').value.trim();

      const subject = encodeURIComponent(`New project inquiry — ${service}`);
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nService: ${service}\n\nMessage:\n${message}`
      );
      const mailtoUrl = `mailto:consultingcedarpoint@gmail.com?subject=${subject}&body=${body}`;
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=consultingcedarpoint@gmail.com&su=${subject}&body=${body}`;

      const gmailTab = window.open(gmailUrl, '_blank', 'noopener');
      if (!gmailTab) {
        // Popup blocked — fall back to the OS mail handler.
        window.location.href = mailtoUrl;
      }

      formNote.innerHTML = `Opening Gmail in a new tab to send your message — just hit send there. Trouble seeing it? Email us directly at <a href="${mailtoUrl}">consultingcedarpoint@gmail.com</a>.`;
      formNote.classList.add('success');
      contactForm.reset();
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
