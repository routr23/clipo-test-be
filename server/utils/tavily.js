const { tavily } = require("@tavily/core");
require('dotenv').config();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

/**
 * Perform a web search and return a context string for the AI.
 */
async function getSearchContext(query) {
  try {
    console.log(`🔍 Searching web for: "${query}"...`);
    const results = await tvly.search(query, {
      searchDepth: "advanced",
      maxResults: 5,
    });

    if (!results || !results.results || results.results.length === 0) {
      return "No search results found.";
    }

    // Format the results into a compact string for Clipo
    let context = "REAL-TIME WEB SEARCH RESULTS:\n";
    results.results.forEach((res, index) => {
      context += `[${index + 1}] Title: ${res.title}\n`;
      context += `Content: ${res.content}\n`;
      context += `URL: ${res.url}\n\n`;
    });

    return { context, results: results.results };
  } catch (error) {
    console.error("Tavily search error:", error);
    return { context: "Failed to fetch real-time data due to a search engine error.", results: [] };
  }
}

/**
 * Detect if a query likely needs a web search.
 */
function needsSearch(query) {
  const lowercaseQuery = query.toLowerCase();
  const searchKeywords = [
    // Entities & People
    'who is', 'who are', 'tell me about', 'profile of', 'social link', 'instagram', 'twitter', 'x.com', 'facebook', 'linkedin',
    // News & Events
    'latest', 'news', 'current', 'today', 'happened', 'update on', 'score', 'price',
    // Facts & Data
    'what is the', 'how many', 'where is', 'stats', 'population', 'stock', 'weather',
    // Links & Sites
    'link', 'website', 'url', 'site', 'socials', 'page', 'official',
    // General Research intent
    'research', 'find info', 'search for', 'verify'
  ];
  
  // Return true if any keyword is found
  return searchKeywords.some(keyword => lowercaseQuery.includes(keyword));
}

module.exports = { getSearchContext, needsSearch };
