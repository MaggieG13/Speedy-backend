// speedy-backend-i18n.js
// Backend server with Bulgarian and English language support
// This keeps your credentials secure and handles API calls with proper language routing

const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors()); // Allow requests from your Shopify store

// ============================================
// CONFIGURATION - UPDATE THESE!
// ============================================
const SPEEDY_CONFIG = {
  username: process.env.SPEEDY_USERNAME || 'YOUR_SPEEDY_USERNAME',
  password: process.env.SPEEDY_PASSWORD || 'YOUR_SPEEDY_PASSWORD',
  baseUrl: 'https://api.speedy.bg/v1',
  defaultLanguage: 'BG' // Default language: 'BG' for Bulgarian, 'EN' for English
};

// Helper function to get credentials with language support
function getCredentials(language = null) {
  const lang = language || SPEEDY_CONFIG.defaultLanguage;
  return {
    userName: SPEEDY_CONFIG.username,
    password: SPEEDY_CONFIG.password,
    language: lang.toUpperCase()
  };
}

// Helper function to validate language parameter
function validateLanguage(lang) {
  if (!lang) return SPEEDY_CONFIG.defaultLanguage;
  const upperLang = lang.toUpperCase();
  return ['BG', 'EN'].includes(upperLang) ? upperLang : SPEEDY_CONFIG.defaultLanguage;
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Speedy API Proxy is running',
    defaultLanguage: SPEEDY_CONFIG.defaultLanguage,
    supportedLanguages: ['BG', 'EN'],
    endpoints: [
      'POST /api/find-site',
      'POST /api/find-offices',
      'POST /api/calculate-rate',
      'POST /api/calculate-shipping',
      'POST /api/search-offices'
    ]
  });
});

/**
 * Find site (city) by name
 * Body: { city: "Sofia", postCode: "1000", language: "BG" }
 */
app.post('/api/find-site', async (req, res) => {
  try {
    const { city, postCode, language } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const lang = validateLanguage(language);
    console.log(`Finding site: ${city} (Language: ${lang})`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/site`,
      {
        ...getCredentials(lang),
        countryId: 100, // Bulgaria
        name: city,
        postCode: postCode
      }
    );

    res.json({
      success: true,
      language: lang,
      sites: response.data.sites || []
    });

  } catch (error) {
    console.error('Error finding site:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || 'Failed to find city'
    });
  }
});

/**
 * Find offices by site ID
 * Body: { siteId: 68134, language: "BG", limit: 50 }
 */
app.post('/api/find-offices', async (req, res) => {
  try {
    const { siteId, siteName, limit = 50, language } = req.body;

    if (!siteId && !siteName) {
      return res.status(400).json({ error: 'siteId or siteName is required' });
    }

    const lang = validateLanguage(language);
    console.log(`Finding offices for site: ${siteId || siteName} (Language: ${lang})`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/office`,
      {
        ...getCredentials(lang),
        countryId: 100,
        siteId: siteId,
        siteName: siteName,
        limit: limit
      }
    );

    res.json({
      success: true,
      language: lang,
      offices: response.data.offices || []
    });

  } catch (error) {
    console.error('Error finding offices:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || 'Failed to find offices'
    });
  }
});

/**
 * Calculate shipping rate
 * Body: { officeId: 123, weight: 1.5, parcelsCount: 1, language: "BG" }
 */
app.post('/api/calculate-rate', async (req, res) => {
  try {
    const { officeId, weight = 1, parcelsCount = 1, language } = req.body;

    if (!officeId) {
      return res.status(400).json({ error: 'officeId is required' });
    }

    const lang = validateLanguage(language);
    console.log(`Calculating rate for office: ${officeId} (Language: ${lang})`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/calculate`,
      {
        ...getCredentials(lang),
        recipient: {
          pickupOfficeId: officeId
        },
        service: {
          serviceId: 505, // Standard courier service
          autoAdjustPickupDate: true
        },
        content: {
          parcelsCount: parcelsCount,
          totalWeight: weight,
          contents: 'Products',
          package: 'BOX'
        },
        payment: {
          courierServicePayer: 'RECIPIENT' // Change to 'SENDER' if you pay shipping
        }
      }
    );

    if (response.data.calculations && response.data.calculations.length > 0) {
      const calc = response.data.calculations[0];
      res.json({
        success: true,
        language: lang,
        price: calc.price.total,
        currency: calc.price.currency,
        pickupDate: calc.pickupDate,
        deliveryDeadline: calc.deliveryDeadline
      });
    } else {
      res.json({
        success: false,
        error: 'No rates available for this office'
      });
    }

  } catch (error) {
    console.error('Error calculating rate:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || 'Failed to calculate rate'
    });
  }
});

/**
 * Calculate shipping cost for specific office and order details
 * Body: { officeId: 123, weight: 1.5, parcelsCount: 1, serviceId: 505, language: "BG" }
 */
app.post('/api/calculate-shipping', async (req, res) => {
  try {
    const { 
      officeId, 
      weight = 1, 
      parcelsCount = 1, 
      serviceId = 505,
      declaredValue,
      cod,
      language
    } = req.body;

    if (!officeId) {
      return res.status(400).json({ error: 'officeId is required' });
    }

    const lang = validateLanguage(language);
    console.log(`Calculating shipping for office ${officeId}, weight: ${weight}kg (Language: ${lang})`);

    // Build the calculation request
    const calculationRequest = {
      ...getCredentials(lang),
      recipient: {
        pickupOfficeId: officeId
      },
      service: {
        serviceId: serviceId,
        autoAdjustPickupDate: true
      },
      content: {
        parcelsCount: parcelsCount,
        totalWeight: weight,
        contents: 'Products',
        package: 'BOX'
      },
      payment: {
        courierServicePayer: 'RECIPIENT' // Change to 'SENDER' if you pay
      }
    };

    // Add optional services if provided
    if (declaredValue || cod) {
      calculationRequest.service.additionalServices = {};
      
      if (declaredValue) {
        calculationRequest.service.additionalServices.declaredValue = {
          amount: declaredValue,
          fragile: false
        };
      }
      
      if (cod) {
        calculationRequest.service.additionalServices.cod = {
          amount: cod,
          processingType: 'CASH'
        };
      }
    }

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/calculate`,
      calculationRequest
    );

    if (response.data.calculations && response.data.calculations.length > 0) {
      const calc = response.data.calculations[0];
      
      res.json({
        success: true,
        language: lang,
        calculation: {
          price: calc.price.total,
          currency: calc.price.currency,
          pickupDate: calc.pickupDate,
          deliveryDeadline: calc.deliveryDeadline,
          serviceName: calc.service?.name || 'Standard Delivery',
          // Breakdown (if available)
          breakdown: {
            basePrice: calc.price.amount || calc.price.total,
            fuelSurcharge: calc.price.fuelSurcharge || 0,
            vat: calc.price.vat || 0
          }
        }
      });
    } else {
      res.json({
        success: false,
        error: 'No rates available for this configuration'
      });
    }

  } catch (error) {
    console.error('Error calculating shipping:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || 'Failed to calculate shipping cost'
    });
  }
});

/**
 * Combined endpoint: Search city and get offices in one call
 * Body: { city: "Sofia", language: "BG" }
 */
app.post('/api/search-offices', async (req, res) => {
  try {
    const { city, language } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const lang = validateLanguage(language);
    console.log(`Searching offices in: ${city} (Language: ${lang})`);

    // Step 1: Find site
    const siteResponse = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/site`,
      {
        ...getCredentials(lang),
        countryId: 100,
        name: city
      }
    );

    const sites = siteResponse.data.sites || [];
    
    if (sites.length === 0) {
      return res.json({
        success: false,
        language: lang,
        error: lang === 'BG' 
          ? `Няма намерени резултати за град: ${city}`
          : `No results found for city: ${city}`,
        offices: []
      });
    }

    // Step 2: Find offices in that site
    const officeResponse = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/office`,
      {
        ...getCredentials(lang),
        countryId: 100,
        siteId: sites[0].id,
        limit: 50
      }
    );

    res.json({
      success: true,
      language: lang,
      city: sites[0],
      offices: officeResponse.data.offices || []
    });

  } catch (error) {
    console.error('Error searching offices:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || 'Failed to search offices'
    });
  }
});

/**
 * Get supported languages
 */
app.get('/api/languages', (req, res) => {
  res.json({
    success: true,
    defaultLanguage: SPEEDY_CONFIG.defaultLanguage,
    supportedLanguages: [
      { code: 'BG', name: 'Български', nativeName: 'Български' },
      { code: 'EN', name: 'English', nativeName: 'English' }
    ]
  });
});

/**
 * Update default language (optional - for dynamic configuration)
 */
app.post('/api/set-language', (req, res) => {
  const { language } = req.body;
  const lang = validateLanguage(language);
  
  SPEEDY_CONFIG.defaultLanguage = lang;
  
  res.json({
    success: true,
    message: `Default language set to ${lang}`,
    currentLanguage: lang
  });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Speedy API Backend Server (Internationalized)      ║
║                                                           ║
║   Status: RUNNING                                        ║
║   Port: ${PORT}                                              ║
║   URL: http://localhost:${PORT}                             ║
║   Default Language: ${SPEEDY_CONFIG.defaultLanguage}                                      ║
║   Supported Languages: BG, EN                            ║
║                                                           ║
║   Endpoints:                                             ║
║   - POST /api/search-offices (recommended)               ║
║   - POST /api/find-site                                  ║
║   - POST /api/find-offices                               ║
║   - POST /api/calculate-rate                             ║
║   - POST /api/calculate-shipping                         ║
║   - GET  /api/languages                                  ║
║   - POST /api/set-language                               ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Test the server (Bulgarian):
curl -X POST http://localhost:${PORT}/api/search-offices \\
  -H "Content-Type: application/json" \\
  -d '{"city": "София", "language": "BG"}'

Test the server (English):
curl -X POST http://localhost:${PORT}/api/search-offices \\
  -H "Content-Type: application/json" \\
  -d '{"city": "Sofia", "language": "EN"}'

Press Ctrl+C to stop the server.
  `);
});

module.exports = app;
