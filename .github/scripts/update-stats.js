#!/usr/bin/env node

/**
 * GitHub Stats Auto-Update Script
 * Fetches GitHub stats and writes them to a data file for Jekyll
 */

const fs = require('fs');
const path = require('path');

const GITHUB_USERNAME = 'michaelcolenso';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OUTPUT_FILE = path.join(__dirname, '../../_data/github-stats.json');

/**
 * Fetch data from GitHub API
 */
async function fetchGitHub(endpoint) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Stats-Updater'
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com${endpoint}`, { headers });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get user information
 */
async function getUserInfo() {
  console.log('Fetching user info...');
  return await fetchGitHub(`/users/${GITHUB_USERNAME}`);
}

/**
 * Get all repositories
 */
async function getAllRepos() {
  console.log('Fetching repositories...');
  let page = 1;
  let allRepos = [];
  let hasMore = true;

  while (hasMore) {
    const repos = await fetchGitHub(`/users/${GITHUB_USERNAME}/repos?per_page=100&page=${page}&sort=updated`);
    allRepos = allRepos.concat(repos);
    hasMore = repos.length === 100;
    page++;
  }

  return allRepos;
}

/**
 * Get contribution data (requires authenticated request)
 */
async function getContributions() {
  try {
    const year = new Date().getFullYear();
    // This is a simplified version - for accurate contribution data,
    // you'd need to use GitHub's GraphQL API
    const events = await fetchGitHub(`/users/${GITHUB_USERNAME}/events/public?per_page=100`);

    const thisYearEvents = events.filter(event => {
      const eventYear = new Date(event.created_at).getFullYear();
      return eventYear === year;
    });

    return {
      thisYear: thisYearEvents.length * 2, // Rough estimate
      total: events.length * 10 // Very rough estimate
    };
  } catch (error) {
    console.error('Error fetching contributions:', error.message);
    return { thisYear: 0, total: 0 };
  }
}

/**
 * Calculate statistics from repos
 */
function calculateRepoStats(repos) {
  const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
  const totalSize = repos.reduce((sum, repo) => sum + repo.size, 0);

  // Language statistics
  const languages = {};
  repos.forEach(repo => {
    if (repo.language) {
      languages[repo.language] = (languages[repo.language] || 0) + 1;
    }
  });

  const topLanguages = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({
      name,
      count,
      percentage: ((count / repos.length) * 100).toFixed(1)
    }));

  return {
    totalStars,
    totalForks,
    totalSize,
    topLanguages
  };
}

/**
 * Get top repositories
 */
function getTopRepos(repos, count = 6) {
  return repos
    .filter(repo => !repo.fork)
    .sort((a, b) => {
      // Score based on stars and recency
      const scoreA = a.stargazers_count * 10 + (new Date(a.updated_at).getTime() / 1000000000);
      const scoreB = b.stargazers_count * 10 + (new Date(b.updated_at).getTime() / 1000000000);
      return scoreB - scoreA;
    })
    .slice(0, count)
    .map(repo => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      updated: repo.updated_at,
      topics: repo.topics || []
    }));
}

/**
 * Get recent activity
 */
async function getRecentActivity() {
  try {
    console.log('Fetching recent activity...');
    const events = await fetchGitHub(`/users/${GITHUB_USERNAME}/events/public?per_page=10`);

    return events.slice(0, 5).map(event => ({
      type: event.type,
      repo: event.repo.name,
      created: event.created_at,
      action: formatEventAction(event)
    }));
  } catch (error) {
    console.error('Error fetching activity:', error.message);
    return [];
  }
}

/**
 * Format event action for display
 */
function formatEventAction(event) {
  const actions = {
    'PushEvent': `Pushed ${event.payload.size} commit(s)`,
    'CreateEvent': `Created ${event.payload.ref_type}`,
    'WatchEvent': 'Starred repository',
    'ForkEvent': 'Forked repository',
    'IssuesEvent': `${event.payload.action} issue`,
    'PullRequestEvent': `${event.payload.action} pull request`,
    'IssueCommentEvent': 'Commented on issue',
    'PullRequestReviewEvent': 'Reviewed pull request'
  };
  return actions[event.type] || event.type;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting GitHub stats update...');
    console.log(`Username: ${GITHUB_USERNAME}`);
    console.log(`Token available: ${!!GITHUB_TOKEN}`);

    // Fetch all data
    const [user, repos, contributions, recentActivity] = await Promise.all([
      getUserInfo(),
      getAllRepos(),
      getContributions(),
      getRecentActivity()
    ]);

    const repoStats = calculateRepoStats(repos);
    const topRepos = getTopRepos(repos);

    // Compile stats object
    const stats = {
      lastUpdated: new Date().toISOString(),
      user: {
        login: user.login,
        name: user.name,
        bio: user.bio,
        location: user.location,
        followers: user.followers,
        following: user.following,
        publicRepos: user.public_repos,
        publicGists: user.public_gists,
        avatarUrl: user.avatar_url,
        profileUrl: user.html_url,
        createdAt: user.created_at
      },
      repos: {
        total: repos.length,
        totalStars: repoStats.totalStars,
        totalForks: repoStats.totalForks,
        totalSize: repoStats.totalSize,
        topLanguages: repoStats.topLanguages,
        featured: topRepos
      },
      contributions: {
        thisYear: contributions.thisYear,
        total: contributions.total
      },
      recentActivity: recentActivity
    };

    // Ensure _data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
    console.log(`✅ Stats written to ${OUTPUT_FILE}`);
    console.log(`📊 ${stats.user.publicRepos} repos, ${stats.repos.totalStars} stars, ${stats.user.followers} followers`);

  } catch (error) {
    console.error('❌ Error updating GitHub stats:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
