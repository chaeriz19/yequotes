import express from 'express';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Cache quotes to avoid hitting Goodreads too often
let cachedQuotes = [];
let lastFetchTime = 0;
const CACHE_LIFETIME = 3600000; // 1 hour

const getQuotes = async () => {
  // Use cached quotes if available and not too old
  const now = Date.now();
  if (cachedQuotes.length > 0 && now - lastFetchTime < CACHE_LIFETIME) {
    return cachedQuotes;
  }

  const browser = await puppeteer.launch({ 
    headless: true,
    defaultViewport: null
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  
  await page.goto("https://www.goodreads.com/author/quotes/859800.Kanye_West", {
    waitUntil: "networkidle2",
    timeout: 60000
  });
  
  await page.waitForSelector('.quote', { timeout: 30000 }).catch(() => {});
  
  const quotesList = await page.evaluate(() => {
    const quoteElements = document.querySelectorAll(".quote");
    
    if (quoteElements.length === 0) {
      const altQuoteElements = document.querySelectorAll("div.quoteDetails");
      
      if (altQuoteElements.length > 0) {
        return Array.from(altQuoteElements).map(element => {
          const textElement = element.querySelector(".quoteText");
          const text = textElement ? textElement.innerText.split("―")[0].trim() : "";
          
          return { text };
        });
      }
      
      return [];
    }
    
    return Array.from(quoteElements).map(quoteElement => {
      const textElement = quoteElement.querySelector(".quoteText");
      const text = textElement ? textElement.innerText.split("―")[0].trim() : "";
      
      return { text };
    });
  });

  await browser.close();
  
  // Update cache
  cachedQuotes = quotesList;
  lastFetchTime = now;
  
  return quotesList;
};

// API endpoint to get a random quote
app.get('/api/quote', async (_req, res) => {
  try {
    const quotes = await getQuotes();
    if (quotes.length === 0) {
      return res.status(404).json({ error: 'No quotes found' });
    }
    
    const randomIndex = Math.floor(Math.random() * quotes.length);
    res.json(quotes[randomIndex]);
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: "Failed to fetch quote" + error });
  }
});

// Serve the main page
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:3000`);
});
