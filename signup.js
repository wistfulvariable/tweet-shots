(function() {
  var form = document.getElementById('signup-form');
  var errorMsg = document.getElementById('error-msg');
  var successArea = document.getElementById('success-area');
  var keyBox = document.getElementById('key-box');
  var copyMsg = document.getElementById('copy-msg');
  var submitBtn = document.getElementById('submit-btn');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    errorMsg.classList.add('hidden');
    successArea.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
      var res = await fetch('/billing/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('email').value.trim(),
          name: document.getElementById('name').value.trim() || undefined,
        }),
      });
      var data = await res.json();
      if (!res.ok) {
        errorMsg.textContent = data.error || 'Signup failed. Please try again.';
        errorMsg.classList.remove('hidden');
        return;
      }
      form.classList.add('hidden');
      keyBox.textContent = data.apiKey;
      successArea.classList.remove('hidden');
    } catch (err) {
      errorMsg.textContent = 'Network error. Please check your connection and try again.';
      errorMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get API Key';
    }
  });

  keyBox.addEventListener('click', function() {
    navigator.clipboard.writeText(keyBox.textContent).then(function() {
      copyMsg.textContent = 'Copied!';
      setTimeout(function() { copyMsg.textContent = 'Click the key to copy it. Save it somewhere safe!'; }, 2000);
    });
  });
})();
