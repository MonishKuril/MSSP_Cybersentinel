const express = require('express');
const router = express.Router();
const axios = require('axios');
const Parser = require('rss-parser');
const parser = new Parser();

// Updated news sources with RSS feeds
const NEWS_SOURCES = [
  {
    name: 'Sophos News',
    url: 'https://news.sophos.com/en-us/feed/',
    type: 'rss'
  },
  {
    name: 'KrebsOnSecurity',
    url: 'https://krebsonsecurity.com/feed/',
    type: 'rss'
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    type: 'rss'
  }
];

// Track current source index
let currentSourceIndex = 0;

router.get('/scrape', async (req, res) => {
  console.log('News scraping initiated...');
  
  try {
    // Get current source and increment index for next request
    const source = NEWS_SOURCES[currentSourceIndex];
    currentSourceIndex = (currentSourceIndex + 1) % NEWS_SOURCES.length;
    
    console.log(`Fetching news from: ${source.url} (${source.name})`);

    let newsItems = [];
    
    if (source.type === 'rss') {
      newsItems = await parseRSSFeed(source);
    } else {
      newsItems = await scrapeHTML(source);
    }

    if (newsItems.length === 0) {
      console.warn('No news items found - check source');
      throw new Error('No news items found');
    }

    console.log(`Successfully fetched ${newsItems.length} items`);
    res.json({ 
      success: true, 
      news: newsItems.slice(0, 10),
      source: source.name,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Fetching failed:', error.message);
    res.status(500).json({ 
      success: false,
      message: error.message,
      news: getFallbackNews(),
      timestamp: new Date().toISOString()
    });
  }
});

async function parseRSSFeed(source) {
  try {
    console.log(`Parsing RSS feed from ${source.url}`);
    const feed = await parser.parseURL(source.url);
    return feed.items.map(item => ({
      title: item.title,
      url: item.link,
      time: item.pubDate || item.isoDate || 'Recent'
    }));
  } catch (error) {
    console.error('RSS parsing failed:', error.message);
    throw new Error('Failed to parse RSS feed');
  }
}

async function scrapeHTML(source) {
  try {
    const { data } = await axios.get(source.url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(data);
    const newsItems = [];

    $(source.selectors.container).each((i, el) => {
      try {
        const title = $(el).find(source.selectors.title).text().trim();
        const url = $(el).find(source.selectors.link).attr('href');
        const time = $(el).find(source.selectors.time).text().trim() || 'Recent';
        
        if (title && url) {
          newsItems.push({ 
            title: `${title} (${time})`,
            url 
          });
        }
      } catch (error) {
        console.error(`Error parsing item ${i}:`, error.message);
      }
    });

    return newsItems;
  } catch (error) {
    console.error('HTML scraping failed:', error.message);
    throw new Error('Failed to scrape HTML');
  }
}

function getFallbackNews() {
  return [
    {
      title: "Dark Web Marketplace Leaks 10 Million Credit Card Numbers",
      url: "#"
    },
    {
      title: "Android Malware Masquerades as Popular Fitness App",
      url: "#"
    },
    {
      title: "AI-Driven Malware Capable of Evading Detection Found in Wild",
      url: "#"
    },
    {
      title: "Cybersecurity Spending Expected to Cross $200B Globally by Year-End",
      url: "#"
    }
  ];
}

module.exports = router;