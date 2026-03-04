/* docs.js — Interactivity for the API documentation page */
(function () {
  'use strict';

  // ─── Code example tabs ──────────────────────────────────────────
  document.querySelectorAll('.example-tabs').forEach(function (tabGroup) {
    var buttons = tabGroup.querySelectorAll('[data-lang]');
    var container = tabGroup.closest('.example-block');
    if (!container) return;

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var lang = btn.getAttribute('data-lang');
        // Deactivate all tabs in this group
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        // Show matching panel, hide others
        container.querySelectorAll('.example-panel[data-lang]').forEach(function (panel) {
          panel.classList.toggle('active', panel.getAttribute('data-lang') === lang);
        });
      });
    });
  });

  // ─── Copy-to-clipboard ──────────────────────────────────────────
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrapper = btn.closest('.code-wrapper');
      if (!wrapper) return;
      var code = wrapper.querySelector('code');
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(function () {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });

  // ─── Smooth scroll for anchor links ─────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', link.getAttribute('href'));
    });
  });

  // ─── Sidebar active section tracking ────────────────────────────
  var sidebarLinks = document.querySelectorAll('.sidebar a[href^="#"]');
  if (sidebarLinks.length === 0) return;

  var sections = [];
  sidebarLinks.forEach(function (link) {
    var id = link.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (el) sections.push({ id: id, el: el, link: link });
  });

  if (!('IntersectionObserver' in window)) return;

  var currentActive = null;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var match = sections.find(function (s) { return s.el === entry.target; });
        if (!match) return;
        if (currentActive) currentActive.classList.remove('active');
        match.link.classList.add('active');
        currentActive = match.link;
      });
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
  );

  sections.forEach(function (s) { observer.observe(s.el); });
})();
