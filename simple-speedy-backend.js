// simple-speedy-backend.js
// A minimal backend server to proxy Speedy API calls
// This keeps your credentials secure

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
  baseUrl: 'https://api.speedy.bg/v1'
};

// Helper function to get credentials
function getCredentials() {
  return {
    userName: SPEEDY_CONFIG.username,
    password: SPEEDY_CONFIG.password,
    language: 'EN'
  };
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
    endpoints: [
      'POST /api/find-site',
      'POST /api/find-offices',
      'POST /api/calculate-rate'
    ]
  });
});

/**
 * Find site (city) by name
 * Body: { city: "Sofia" }
 */
app.post('/api/find-site', async (req, res) => {
  try {
    const { city, postCode } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    console.log(`Finding site: ${city}`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/site`,
      {
        ...getCredentials(),
        countryId: 100, // Bulgaria
        name: city,
        postCode: postCode
      }
    );

    res.json({
      success: true,
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
 * Body: { siteId: 68134 }
 */
app.post('/api/find-offices', async (req, res) => {
  try {
    const { siteId, siteName, limit = 50 } = req.body;

    if (!siteId && !siteName) {
      return res.status(400).json({ error: 'siteId or siteName is required' });
    }

    console.log(`Finding offices for site: ${siteId || siteName}`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/office`,
      {
        ...getCredentials(),
        countryId: 100,
        siteId: siteId,
        siteName: siteName,
        limit: limit
      }
    );

    res.json({
      success: true,
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
 * Body: { officeId: 123, weight: 1.5, parcelsCount: 1 }
 */
app.post('/api/calculate-rate', async (req, res) => {
  try {
    const { officeId, weight = 1, parcelsCount = 1 } = req.body;

    if (!officeId) {
      return res.status(400).json({ error: 'officeId is required' });
    }

    console.log(`Calculating rate for office: ${officeId}`);

    const response = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/calculate`,
      {
        ...getCredentials(),
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
 * Body: { officeId: 123, weight: 1.5, parcelsCount: 1, serviceId: 505 }
 */
app.post('/api/calculate-shipping', async (req, res) => {
  try {
    const { 
      officeId, 
      weight = 1, 
      parcelsCount = 1, 
      serviceId = 505,
      declaredValue,
      cod 
    } = req.body;

    if (!officeId) {
      return res.status(400).json({ error: 'officeId is required' });
    }

    console.log(`Calculating shipping for office ${officeId}, weight: ${weight}kg`);

    // Build the calculation request
    const calculationRequest = {
      ...getCredentials(),
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
 * Body: { city: "Sofia" }
 */
app.post('/api/search-offices', async (req, res) => {
  try {
    const { city } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    console.log(`Searching offices in: ${city}`);

    // Step 1: Find site
    const siteResponse = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/site`,
      {
        ...getCredentials(),
        countryId: 100,
        name: city
      }
    );

    const sites = siteResponse.data.sites || [];
    
    if (sites.length === 0) {
      return res.json({
        success: false,
        error: `No results found for city: ${city}`,
        offices: []
      });
    }

    // Step 2: Find offices in that site
    const officeResponse = await axios.post(
      `${SPEEDY_CONFIG.baseUrl}/location/office`,
      {
        ...getCredentials(),
        countryId: 100,
        siteId: sites[0].id,
        limit: 50
      }
    );

    res.json({
      success: true,
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

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 Speedy API Backend Server                           ║
║                                                           ║
║   Status: RUNNING                                        ║
║   Port: ${PORT}                                              ║
║   URL: http://localhost:${PORT}                             ║
║                                                           ║
║   Endpoints:                                             ║
║   - POST /api/search-offices (recommended)               ║
║   - POST /api/find-site                                  ║
║   - POST /api/find-offices                               ║
║   - POST /api/calculate-rate                             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Test the server:
curl -X POST http://localhost:${PORT}/api/search-offices \\
  -H "Content-Type: application/json" \\
  -d '{"city": "Sofia"}'

Press Ctrl+C to stop the server.
  `);
});

module.exports = app;
