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
          <meta http-equiv="refresh" content="3;url=https://duckbuck.app">
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
            .countdown { 
              font-size: 18px; 
              color: #00cc00; 
              font-weight: bold;
              margin: 20px 0;
            }
          </style>
          <script>
            document.addEventListener('DOMContentLoaded', function() {
              startRedirect();
            });
            
            window.onload = function() {
              startRedirect();
            };
            
            function startRedirect() {
              if (window.redirectStarted) return;
              window.redirectStarted = true;
              
              let secondsLeft = 3;
              const countdownElement = document.getElementById('countdown');
              
              const timer = setInterval(function() {
                secondsLeft--;
                
                if (countdownElement) {
                  countdownElement.textContent = secondsLeft;
                }
                
                if (secondsLeft <= 0) {
                  clearInterval(timer);
                  window.location.href = "https://duckbuck.app";
                }
              }, 1000);
            }
          </script>
        </head>
        <body>
          <div>
            <h1>DuckBuck API</h1>
            <p>This endpoint is restricted</p>
            <div class="countdown">
              Redirecting in <span id="countdown">3</span> seconds...
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = {
  renderLandingPage
};
