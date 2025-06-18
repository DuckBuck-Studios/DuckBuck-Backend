const fs = require('fs');
const path = require('path');

/**
 * Read system prompt from file
 * @returns {string} The system prompt text
 */
const getSystemPrompt = () => {
  try {
    const promptPath = path.join(__dirname, 'system-prompt.txt');
    return fs.readFileSync(promptPath, 'utf8').trim();
  } catch (error) {
    console.error('Error reading system prompt file:', error);
    // Fallback prompt if file reading fails
    return 'You are DuckBuck AI, a helpful assistant created by DuckBuck Studios. Respond naturally in the language the user speaks - Hindi or English.';
  }
};

module.exports = {
  getSystemPrompt
};
