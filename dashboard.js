(function() {
  'use strict';

  firebase.initializeApp({
    apiKey: document.querySelector('meta[name="firebase-api-key"]').content,
    authDomain: document.querySelector('meta[name="firebase-auth-domain"]').content,
    projectId: 'tweet-shots-api',
  });

  var auth = firebase.auth();
  var provider = new firebase.auth.GoogleAuthProvider();

  // DOM refs
  var authLoading = document.getElementById('auth-loading');
  var signInArea = document.getElementById('sign-in-area');
  var dashboardArea = document.getElementById('dashboard-area');
  var errorBanner = document.getElementById('error-banner');
  var googleBtn = document.getElementById('google-sign-in-btn');
  var signOutBtn = document.getElementById('sign-out-btn');
  var userAvatar = document.getElementById('user-avatar');
  var userName = document.getElementById('user-name');
  var userEmail = document.getElementById('user-email');
  var tierBadge = document.getElementById('tier-badge');
  var apiKeyDisplay = document.getElementById('api-key-display');
  var toggleKeyBtn = document.getElementById('toggle-key-btn');
  var copyKeyBtn = document.getElementById('copy-key-btn');
  var usageBarFill = document.getElementById('usage-bar-fill');
  var usageCount = document.getElementById('usage-count');
  var usageRemaining = document.getElementById('usage-remaining');
  var planDetails = document.getElementById('plan-details');
  var upgradeBtn = document.getElementById('upgrade-btn');
  var manageBillingBtn = document.getElementById('manage-billing-btn');

  var fullApiKey = '';
  var keyRevealed = false;

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
    setTimeout(function() { errorBanner.style.display = 'none'; }, 8000);
  }

  function hideAll() {
    authLoading.style.display = 'none';
    signInArea.style.display = 'none';
    dashboardArea.style.display = 'none';
  }

  async function getToken() {
    var user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(false);
  }

  async function apiCall(method, path, body) {
    var token = await getToken();
    if (!token) throw new Error('Not authenticated');
    var opts = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(path, opts);
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function maskKey(key) {
    return key.slice(0, 12) + '...' + key.slice(-4);
  }

  function renderDashboard(data) {
    fullApiKey = data.apiKey;
    keyRevealed = false;
    apiKeyDisplay.textContent = maskKey(data.apiKey);
    toggleKeyBtn.textContent = 'Show';

    // Tier badge
    tierBadge.textContent = data.tier;
    tierBadge.className = 'tier-badge tier-' + data.tier;

    // Usage
    var used = data.usage.used || 0;
    var limit = data.usage.limit || 50;
    var pct = Math.min(100, Math.round((used / limit) * 100));
    usageBarFill.style.width = pct + '%';
    usageBarFill.className = 'usage-bar-fill' + (pct >= 90 ? ' danger' : pct >= 70 ? ' warning' : '');
    usageCount.textContent = used + ' / ' + limit + ' credits used';
    usageRemaining.textContent = data.usage.remaining + ' remaining';

    // Plan details
    var td = data.tierDetails;
    planDetails.textContent = data.tier.charAt(0).toUpperCase() + data.tier.slice(1) + ' plan'
      + ' \u2014 ' + td.rateLimit + ' req/min, ' + td.monthlyCredits + ' credits/mo'
      + (td.price > 0 ? ', $' + td.price + '/mo' : ', free');

    // Show upgrade if not business
    if (data.tier !== 'business') {
      upgradeBtn.style.display = 'inline-block';
    } else {
      upgradeBtn.style.display = 'none';
    }

    // Show manage billing if Stripe customer exists
    if (data.stripeCustomerId) {
      manageBillingBtn.style.display = 'inline-block';
    } else {
      manageBillingBtn.style.display = 'none';
    }
  }

  async function loadDashboard(user) {
    hideAll();
    dashboardArea.style.display = 'block';

    // User info
    userName.textContent = user.displayName || user.email;
    userEmail.textContent = user.email;
    if (user.photoURL) {
      userAvatar.src = user.photoURL;
      userAvatar.style.display = 'block';
    }

    try {
      // Link user (idempotent)
      await apiCall('POST', '/dashboard/api/link');
      // Load data
      var data = await apiCall('GET', '/dashboard/api/data');
      renderDashboard(data);
    } catch (err) {
      showError(err.message);
    }
  }

  // Auth state listener
  auth.onAuthStateChanged(function(user) {
    hideAll();
    if (user) {
      loadDashboard(user);
    } else {
      signInArea.style.display = 'block';
    }
  });

  // Sign in
  googleBtn.addEventListener('click', function() {
    auth.signInWithPopup(provider).catch(function(err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showError('Sign-in failed: ' + err.message);
      }
    });
  });

  // Sign out
  signOutBtn.addEventListener('click', function() {
    auth.signOut();
  });

  // Toggle key visibility
  toggleKeyBtn.addEventListener('click', function() {
    keyRevealed = !keyRevealed;
    apiKeyDisplay.textContent = keyRevealed ? fullApiKey : maskKey(fullApiKey);
    toggleKeyBtn.textContent = keyRevealed ? 'Hide' : 'Show';
  });

  // Copy key
  copyKeyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(fullApiKey).then(function() {
      var orig = copyKeyBtn.textContent;
      copyKeyBtn.textContent = 'Copied!';
      setTimeout(function() { copyKeyBtn.textContent = orig; }, 2000);
    });
  });

  // Upgrade
  upgradeBtn.addEventListener('click', async function() {
    try {
      upgradeBtn.disabled = true;
      upgradeBtn.textContent = 'Loading...';
      var data = await apiCall('POST', '/dashboard/api/checkout', { tier: 'pro' });
      window.location.href = data.url;
    } catch (err) {
      showError(err.message);
      upgradeBtn.disabled = false;
      upgradeBtn.textContent = 'Upgrade Plan';
    }
  });

  // Manage billing
  manageBillingBtn.addEventListener('click', async function() {
    try {
      manageBillingBtn.disabled = true;
      manageBillingBtn.textContent = 'Loading...';
      var data = await apiCall('POST', '/dashboard/api/portal');
      window.location.href = data.url;
    } catch (err) {
      showError(err.message);
      manageBillingBtn.disabled = false;
      manageBillingBtn.textContent = 'Manage Billing';
    }
  });

  // Handle checkout return
  var params = new URLSearchParams(window.location.search);
  if (params.get('checkout') === 'success') {
    history.replaceState(null, '', '/dashboard');
  } else if (params.get('checkout') === 'cancel') {
    history.replaceState(null, '', '/dashboard');
  }
})();
