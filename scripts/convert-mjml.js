const fs = require('fs');
const path = require('path');
const mjml2html = require('mjml');

// Paths
const mjmlDir = path.join(__dirname, '../src/templates/mjml');
const htmlDir = path.join(__dirname, '../src/templates/html');

// Ensure HTML directory exists
if (!fs.existsSync(htmlDir)) {
  fs.mkdirSync(htmlDir, { recursive: true });
}

// Get all MJML files
const mjmlFiles = fs.readdirSync(mjmlDir).filter(file => file.endsWith('.mjml'));

console.log(`Found ${mjmlFiles.length} MJML files to convert...`);

// Convert each file
mjmlFiles.forEach(file => {
  const mjmlPath = path.join(mjmlDir, file);
  const htmlPath = path.join(htmlDir, file.replace('.mjml', '.html'));
  
  // Read MJML content
  const mjmlContent = fs.readFileSync(mjmlPath, 'utf8');
  
  // Convert to HTML
  const result = mjml2html(mjmlContent, { 
    validationLevel: 'strict',
    minify: true,
    beautify: true
  });
  
  if (result.errors && result.errors.length > 0) {
    console.error(`Error converting ${file}:`, result.errors);
    return;
  }
  
  // Write HTML file
  fs.writeFileSync(htmlPath, result.html, 'utf8');
  console.log(`✅ Converted ${file} to HTML`);
});

console.log('MJML conversion completed!');
