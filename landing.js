(function() {
  'use strict';

  var urlInput = document.getElementById('demo-url');
  var generateBtn = document.getElementById('demo-generate');
  var placeholderEl = document.getElementById('demo-placeholder');
  var resultArea = document.getElementById('demo-result');
  var loadingEl = document.getElementById('demo-loading');
  var errorEl = document.getElementById('demo-error');
  var imageContainer = document.getElementById('demo-image-container');
  var imageEl = document.getElementById('demo-image');
  var downloadLink = document.getElementById('demo-download');
  var copyApiBtn = document.getElementById('demo-copy-api');
  var dimensionSelect = document.getElementById('demo-dimension');
  var advancedToggle = document.getElementById('demo-advanced-toggle');
  var advancedContent = document.getElementById('demo-advanced-content');
  var paddingSlider = document.getElementById('demo-padding');
  var paddingVal = document.getElementById('demo-padding-val');
  var radiusSlider = document.getElementById('demo-radius');
  var radiusVal = document.getElementById('demo-radius-val');

  var currentBlobUrl = null;
  var loadingTextEl = document.getElementById('demo-loading-text');
  var loadingTimer = null;

  // Theme default colors — used to detect when user has customized
  var themeColors = {
    dark:  { bg: '#15202b', text: '#f7f9f9', link: '#1d9bf0' },
    light: { bg: '#ffffff', text: '#0f1419', link: '#1d9bf0' },
    dim:   { bg: '#1e2732', text: '#f7f9f9', link: '#1d9bf0' },
    black: { bg: '#000000', text: '#e7e9ea', link: '#1d9bf0' },
  };

  // Advanced options toggle
  advancedToggle.addEventListener('click', function() {
    advancedToggle.classList.toggle('open');
    advancedContent.classList.toggle('open');
  });

  // Chip picker — toggle active state within each group
  document.querySelectorAll('.demo-chips').forEach(function(group) {
    group.addEventListener('click', function(e) {
      var chip = e.target.closest('.demo-chip');
      if (!chip) return;
      group.querySelectorAll('.demo-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
    });
  });

  var gradientAngleSlider = document.getElementById('demo-gradientAngle');
  var gradientAngleVal = document.getElementById('demo-gradientAngle-val');
  var customGradientPanel = document.getElementById('demo-custom-gradient');

  // Show/hide custom gradient panel when "Custom" chip is selected
  document.getElementById('demo-gradient').addEventListener('click', function(e) {
    var chip = e.target.closest('.demo-chip');
    if (!chip) return;
    customGradientPanel.style.display = chip.dataset.value === 'custom' ? 'block' : 'none';
  });

  // Range sliders — live value display
  paddingSlider.addEventListener('input', function() { paddingVal.textContent = paddingSlider.value; });
  radiusSlider.addEventListener('input', function() { radiusVal.textContent = radiusSlider.value; });
  gradientAngleSlider.addEventListener('input', function() { gradientAngleVal.textContent = gradientAngleSlider.value; });

  // Color inputs — mark dirty on change, reset button clears
  document.querySelectorAll('.demo-color-field').forEach(function(field) {
    var input = field.querySelector('.demo-color-input');
    var resetBtn = field.querySelector('.demo-color-reset');
    if (!resetBtn) return; // gradient from/to fields have no reset button
    input.addEventListener('input', function() { field.classList.add('dirty'); });
    resetBtn.addEventListener('click', function() {
      field.classList.remove('dirty');
      // Reset to current theme defaults
      var theme = getSelectedValue('demo-theme') || 'dark';
      var defaults = themeColors[theme] || themeColors.dark;
      if (input.id === 'demo-bgColor') input.value = defaults.bg;
      else if (input.id === 'demo-textColor') input.value = defaults.text;
      else if (input.id === 'demo-linkColor') input.value = defaults.link;
    });
  });

  // When theme changes, update color pickers to theme defaults (if not dirty)
  document.getElementById('demo-theme').addEventListener('click', function(e) {
    var chip = e.target.closest('.demo-chip');
    if (!chip) return;
    var theme = chip.dataset.value;
    var defaults = themeColors[theme] || themeColors.dark;
    var fields = [
      { id: 'demo-bgColor-field', input: 'demo-bgColor', key: 'bg' },
      { id: 'demo-textColor-field', input: 'demo-textColor', key: 'text' },
      { id: 'demo-linkColor-field', input: 'demo-linkColor', key: 'link' },
    ];
    fields.forEach(function(f) {
      var field = document.getElementById(f.id);
      if (!field.classList.contains('dirty')) {
        document.getElementById(f.input).value = defaults[f.key];
      }
    });
  });

  function getSelectedValue(groupId) {
    var active = document.querySelector('#' + groupId + ' .demo-chip.active');
    return active ? active.dataset.value : '';
  }

  function buildQueryString() {
    var params = new URLSearchParams();

    var theme = getSelectedValue('demo-theme');
    if (theme && theme !== 'dark') params.set('theme', theme);

    var format = getSelectedValue('demo-format');
    if (format && format !== 'png') params.set('format', format);

    var scale = getSelectedValue('demo-scale');
    if (scale && scale !== '2') params.set('scale', scale);

    var gradient = getSelectedValue('demo-gradient');
    if (gradient && gradient !== 'custom') params.set('gradient', gradient);

    // Custom gradient colors + angle
    if (gradient === 'custom') {
      params.set('gradientFrom', document.getElementById('demo-gradientFrom').value);
      params.set('gradientTo', document.getElementById('demo-gradientTo').value);
      var angle = gradientAngleSlider.value;
      if (angle !== '135') params.set('gradientAngle', angle);
    }

    // Phone frame
    var frame = getSelectedValue('demo-frame');
    if (frame) params.set('frame', frame);

    var dimension = dimensionSelect.value;
    if (dimension !== 'auto') params.set('dimension', dimension);

    var padding = paddingSlider.value;
    if (padding !== '20') params.set('padding', padding);

    var radius = radiusSlider.value;
    if (radius !== '16') params.set('radius', radius);

    // Colors — only send if user has customized (dirty)
    var colorFields = [
      { fieldId: 'demo-bgColor-field', inputId: 'demo-bgColor', param: 'bgColor' },
      { fieldId: 'demo-textColor-field', inputId: 'demo-textColor', param: 'textColor' },
      { fieldId: 'demo-linkColor-field', inputId: 'demo-linkColor', param: 'linkColor' },
    ];
    colorFields.forEach(function(cf) {
      if (document.getElementById(cf.fieldId).classList.contains('dirty')) {
        params.set(cf.param, document.getElementById(cf.inputId).value);
      }
    });

    var toggles = ['hideMetrics', 'hideMedia', 'hideDate', 'hideVerified', 'hideQuoteTweet', 'hideShadow'];
    toggles.forEach(function(id) {
      if (document.getElementById('demo-' + id).checked) params.set(id, 'true');
    });

    if (document.getElementById('demo-showUrl').checked) params.set('showUrl', 'true');

    if (document.getElementById('demo-thread').checked) params.set('thread', 'true');

    return params.toString();
  }

  function showLoading() {
    placeholderEl.style.display = 'none';
    resultArea.style.display = 'flex';
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    imageContainer.style.display = 'none';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
    loadingTextEl.textContent = 'Generating screenshot...';
    if (loadingTimer) clearInterval(loadingTimer);
    var startTime = Date.now();
    loadingTimer = setInterval(function() {
      var elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed >= 5) {
        loadingTextEl.textContent = 'Still rendering... (' + elapsed + 's) Tweets with images take longer.';
      }
    }, 1000);
  }

  function stopLoadingTimer() {
    if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  }

  function showError(message) {
    stopLoadingTimer();
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.textContent = message;
    imageContainer.style.display = 'none';
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }

  function showErrorHTML(html) {
    stopLoadingTimer();
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.innerHTML = html;
    imageContainer.style.display = 'none';
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }

  function showImage(blobUrl) {
    stopLoadingTimer();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = blobUrl;

    loadingEl.style.display = 'none';
    errorEl.style.display = 'none';
    imageContainer.style.display = 'flex';
    imageContainer.classList.remove('demo-fade-in');
    void imageContainer.offsetWidth; // force reflow for animation restart
    imageContainer.classList.add('demo-fade-in');

    var format = getSelectedValue('demo-format') || 'png';
    var ext = format === 'svg' ? 'svg' : 'png';
    imageEl.src = blobUrl;
    downloadLink.href = blobUrl;
    downloadLink.download = 'tweet-screenshot.' + ext;
    downloadLink.textContent = 'Download ' + ext.toUpperCase();
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }

  async function generate() {
    var input = urlInput.value.trim();
    if (!input) { urlInput.focus(); return; }

    showLoading();

    var qs = buildQueryString();
    var encodedInput = encodeURIComponent(input);
    var url = '/demo/screenshot/' + encodedInput + (qs ? '?' + qs : '');

    try {
      var response = await fetch(url);

      if (!response.ok) {
        var body = await response.json().catch(function() { return null; });
        if (response.status === 429) {
          showErrorHTML('Rate limit reached (5 requests/min). <a href="/billing/signup" style="color:#60a5fa;text-decoration:underline;">Sign up for an API key</a> for higher limits.');
        } else if (response.status === 504) {
          showError(body && body.error ? body.error : 'This tweet took too long to render. Try checking "Hide media" or using a different tweet.');
        } else if (response.status === 400) {
          showError(body && body.error ? body.error : 'Invalid tweet URL or ID. Please check and try again.');
        } else {
          showError(body && body.error ? body.error : 'Something went wrong. Please try again.');
        }
        return;
      }

      var blob = await response.blob();
      showImage(URL.createObjectURL(blob));
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    }
  }

  function copyApiCall() {
    var input = urlInput.value.trim();
    if (!input) return;

    var qs = buildQueryString();
    var encodedInput = encodeURIComponent(input);
    var apiCall = 'curl "' + window.location.origin + '/screenshot/' + encodedInput + (qs ? '?' + qs : '') + '" \\\n  -H "X-API-KEY: your-api-key" \\\n  -o tweet.png';

    navigator.clipboard.writeText(apiCall).then(function() {
      var original = copyApiBtn.textContent;
      copyApiBtn.textContent = 'Copied!';
      setTimeout(function() { copyApiBtn.textContent = original; }, 2000);
    });
  }

  generateBtn.addEventListener('click', generate);
  urlInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') generate(); });
  copyApiBtn.addEventListener('click', copyApiCall);
})();
