// GitHub Stats Dynamic Loader
(function() {
  const GITHUB_USERNAME = 'michaelcolenso';
  const API_BASE = 'https://api.github.com';

  // Cache for API responses
  let cache = {
    user: null,
    repos: null,
    timestamp: null
  };

  // Check if cache is valid (1 hour)
  function isCacheValid() {
    if (!cache.timestamp) return false;
    const oneHour = 60 * 60 * 1000;
    return (Date.now() - cache.timestamp) < oneHour;
  }

  // Fetch with error handling
  async function fetchGitHub(endpoint) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('GitHub API Error:', error);
      return null;
    }
  }

  // Fetch user data
  async function fetchUserData() {
    if (cache.user && isCacheValid()) return cache.user;

    const user = await fetchGitHub(`/users/${GITHUB_USERNAME}`);
    if (user) {
      cache.user = user;
      cache.timestamp = Date.now();
    }
    return user;
  }

  // Fetch repositories
  async function fetchRepos() {
    if (cache.repos && isCacheValid()) return cache.repos;

    const repos = await fetchGitHub(`/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated`);
    if (repos) {
      cache.repos = repos;
      cache.timestamp = Date.now();
    }
    return repos;
  }

  // Update basic stats
  async function updateBasicStats() {
    const user = await fetchUserData();
    if (!user) return;

    // Update DOM elements
    const totalRepos = document.getElementById('total-repos');
    const totalFollowers = document.getElementById('total-followers');

    if (totalRepos) totalRepos.textContent = user.public_repos || 0;
    if (totalFollowers) totalFollowers.textContent = user.followers || 0;

    // Animate numbers
    animateValue('total-repos', 0, user.public_repos || 0, 1000);
    animateValue('total-followers', 0, user.followers || 0, 1000);
  }

  // Calculate total stars
  async function updateStarsCount() {
    const repos = await fetchRepos();
    if (!repos) return;

    const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const starsElement = document.getElementById('total-stars');

    if (starsElement) {
      animateValue('total-stars', 0, totalStars, 1000);
    }
  }

  // Get language statistics
  async function updateLanguageStats() {
    const repos = await fetchRepos();
    if (!repos) return;

    // Count language usage
    const languageCounts = {};
    let totalBytes = 0;

    repos.forEach(repo => {
      if (repo.language) {
        languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
        totalBytes += repo.size || 0;
      }
    });

    // Sort by count
    const sortedLanguages = Object.entries(languageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Render language bars
    const container = document.getElementById('language-bars');
    if (!container) return;

    const maxCount = sortedLanguages[0][1];

    container.innerHTML = sortedLanguages.map(([lang, count]) => {
      const percentage = (count / maxCount * 100).toFixed(1);
      const repoPercent = (count / repos.length * 100).toFixed(1);

      return `
        <div class="language-bar">
          <div class="language-info">
            <span class="language-name">${lang}</span>
            <span class="language-count">${count} repos (${repoPercent}%)</span>
          </div>
          <div class="bar-container">
            <div class="bar-fill" style="width: ${percentage}%; background-color: ${getLanguageColor(lang)}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Display recent repositories
  async function updateRecentRepos() {
    const repos = await fetchRepos();
    if (!repos) return;

    const container = document.getElementById('repos-grid');
    if (!container) return;

    // Get top 6 repos (by stars and recent updates)
    const topRepos = repos
      .filter(repo => !repo.fork)
      .sort((a, b) => {
        // Combine stars and recency for ranking
        const scoreA = (a.stargazers_count || 0) * 10 + (new Date(a.updated_at).getTime() / 1000000000);
        const scoreB = (b.stargazers_count || 0) * 10 + (new Date(b.updated_at).getTime() / 1000000000);
        return scoreB - scoreA;
      })
      .slice(0, 6);

    container.innerHTML = topRepos.map(repo => `
      <div class="repo-card">
        <div class="repo-header">
          <h4 class="repo-name">
            <a href="${repo.html_url}" target="_blank" rel="noopener">${repo.name}</a>
          </h4>
          ${repo.stargazers_count > 0 ? `<span class="repo-stars">⭐ ${repo.stargazers_count}</span>` : ''}
        </div>
        <p class="repo-description">${repo.description || 'No description available'}</p>
        <div class="repo-footer">
          ${repo.language ? `<span class="repo-language"><span class="lang-dot" style="background-color: ${getLanguageColor(repo.language)}"></span>${repo.language}</span>` : ''}
          ${repo.forks_count > 0 ? `<span class="repo-forks">🔱 ${repo.forks_count}</span>` : ''}
          <span class="repo-updated">Updated ${timeAgo(repo.updated_at)}</span>
        </div>
      </div>
    `).join('');
  }

  // Estimate contributions (this is approximate - real data needs GitHub GraphQL API)
  async function updateContributions() {
    const repos = await fetchRepos();
    if (!repos) return;

    // Rough estimate based on repo activity
    // Note: For accurate data, you'd need to use GitHub GraphQL API with authentication
    const thisYear = new Date().getFullYear();
    const estimatedContributions = repos.filter(repo => {
      const updatedYear = new Date(repo.updated_at).getFullYear();
      return updatedYear === thisYear;
    }).length * 15; // Rough multiplier

    const element = document.getElementById('total-contributions');
    if (element) {
      animateValue('total-contributions', 0, estimatedContributions, 1000);
    }
  }

  // Helper: Animate number counting
  function animateValue(id, start, end, duration) {
    const element = document.getElementById(id);
    if (!element) return;

    const range = end - start;
    const increment = range / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.floor(current);
    }, 16);
  }

  // Helper: Get language color
  function getLanguageColor(language) {
    const colors = {
      'JavaScript': '#f1e05a',
      'TypeScript': '#3178c6',
      'Python': '#3572A5',
      'Java': '#b07219',
      'Go': '#00ADD8',
      'Ruby': '#701516',
      'PHP': '#4F5D95',
      'C++': '#f34b7d',
      'C': '#555555',
      'C#': '#178600',
      'Swift': '#ffac45',
      'Kotlin': '#A97BFF',
      'Rust': '#dea584',
      'HTML': '#e34c26',
      'CSS': '#563d7c',
      'Vue': '#41b883',
      'Shell': '#89e051',
      'Dart': '#00B4AB',
      'R': '#198CE7',
      'Scala': '#c22d40'
    };
    return colors[language] || '#858585';
  }

  // Helper: Time ago formatter
  function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };

    for (const [name, secondsInInterval] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInInterval);
      if (interval >= 1) {
        return `${interval} ${name}${interval !== 1 ? 's' : ''} ago`;
      }
    }

    return 'just now';
  }

  // Initialize when DOM is ready
  function init() {
    if (document.getElementById('total-repos')) {
      updateBasicStats();
      updateStarsCount();
      updateLanguageStats();
      updateRecentRepos();
      updateContributions();
    }
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
