(function(){
  var navToggle = document.getElementById('navToggle');
  var mainNav = document.getElementById('mainNav');

  navToggle.addEventListener('click', function(){
    var open = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  mainNav.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      mainNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });

  document.getElementById('year').textContent = new Date().getFullYear();

  var backToTop = document.getElementById('backToTop');
  window.addEventListener('scroll', function(){
    backToTop.classList.toggle('visible', window.scrollY > 500);
  });
  backToTop.addEventListener('click', function(){
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  var sections = document.querySelectorAll('.section, .hero');
  sections.forEach(function(el){ el.querySelectorAll('h2, .feature-card, .brain-card, .portfolio-card, .loop-step, .stat-card, .testimonial-card').forEach(function(child){
    child.setAttribute('data-reveal', '');
  }); });

  if('IntersectionObserver' in window){
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('[data-reveal]').forEach(function(el){ observer.observe(el); });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function(el){ el.classList.add('in-view'); });
  }

  var form = document.getElementById('contactForm');
  var status = document.getElementById('formStatus');
  if(form){
    form.addEventListener('submit', function(e){
      if(!form.checkValidity()){ return; }
      // Netlify Forms (data-netlify="true") handles submission natively when hosted on Netlify.
      // For other static hosts, fall back to a mailto draft so the message is never lost.
      var isNetlify = window.location.hostname.indexOf('netlify') !== -1;
      if(!isNetlify){
        e.preventDefault();
        var data = new FormData(form);
        var body = 'Business: ' + data.get('business') + '%0D%0A' +
                    'Service: ' + data.get('service') + '%0D%0A%0D%0A' +
                    encodeURIComponent(data.get('message'));
        var subject = encodeURIComponent('New inquiry from ' + data.get('name'));
        window.location.href = 'mailto:consultingcedarpoint@gmail.com?subject=' + subject +
          '&body=' + 'From: ' + encodeURIComponent(data.get('name') + ' <' + data.get('email') + '>') + '%0D%0A' + body;
        status.textContent = 'Opening your email client to send this message...';
        setTimeout(function(){ form.reset(); }, 400);
      } else {
        status.textContent = 'Sending...';
      }
    });
  }
})();
