/**
 * HTML response renderer for API landing page
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Renders the API landing page HTML
 * @param {Object} data - Data to inject into the template
 * @returns {string} HTML content
 */
function renderLandingPage(data = {}) {
  try {
    const templatePath = path.join(__dirname, '../templates/html/api-landing.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace template variables
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      htmlContent = htmlContent.replace(regex, data[key]);
    });
    
    return htmlContent;
  } catch (error) {
    logger.error('Error rendering API landing page:', error);
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>DuckBuck API</title>
          <style>
            body {
              font-family: 'Roboto', 'Helvetica', 'Arial', sans-serif;
              background-color: #000000;
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              color: #7f7f7f;
              text-align: center;
            }
            h1 { color: #ffffff; }
          </style>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.location.href = "https://duckbuck.app";
              }, 3000);
            }
          </script>
        </head>
        <body>
          <div>
            <h1>DuckBuck API</h1>
            <p>Redirecting to duckbuck.app...</p>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = {
  renderLandingPage
};
