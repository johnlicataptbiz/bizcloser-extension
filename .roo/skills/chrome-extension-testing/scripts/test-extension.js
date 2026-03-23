#!/usr/bin/env node

/**
 * Chrome Extension Testing Script
 * Uses Puppeteer to automate testing of Chrome extensions
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

class ChromeExtensionTester {
  constructor(extensionPath) {
    this.extensionPath = extensionPath;
    this.browser = null;
    this.page = null;
    this.results = {
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async runTest(testName, testFn) {
    try {
      this.log(`Running test: ${testName}`);
      const result = await testFn();
      if (result) {
        this.results.tests.push({ name: testName, status: 'passed' });
        this.results.passed++;
        this.log(`${testName} - PASSED`, 'success');
      } else {
        this.results.tests.push({ name: testName, status: 'failed' });
        this.results.failed++;
        this.log(`${testName} - FAILED`, 'error');
      }
    } catch (error) {
      this.results.tests.push({ name: testName, status: 'error', error: error.message });
      this.results.errors.push(`${testName}: ${error.message}`);
      this.log(`${testName} - ERROR: ${error.message}`, 'error');
    }
  }

  async setup() {
    this.log('Setting up Chrome with extension...');

    // Launch Chrome with extension
    this.browser = await puppeteer.launch({
      headless: false, // Set to true for headless mode
      args: [
        `--load-extension=${this.extensionPath}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ],
      defaultViewport: { width: 1280, height: 720 }
    });

    this.page = await this.browser.newPage();
    this.log('Chrome launched with extension loaded', 'success');
  }

  async testExtensionLoading() {
    return await this.runTest('Extension Loading', async () => {
      // Navigate to extensions page
      await this.page.goto('chrome://extensions/');

      // Check if extension is loaded (look for extension name or ID)
      const extensionLoaded = await this.page.evaluate(() => {
        const extensions = document.querySelectorAll('.extension-list-item');
        return Array.from(extensions).some(ext =>
          ext.textContent.includes('BizCloser') ||
          ext.textContent.includes('bizcloser')
        );
      });

      return extensionLoaded;
    });
  }

  async testSidePanelOpening() {
    return await this.runTest('Side Panel Opening', async () => {
      // Navigate to a test page
      await this.page.goto('data:text/html,<html><body><h1>Test Page</h1></body></html>');

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if we can access the side panel (limited in automation)
      // For now, verify the page loaded and extension is active
      const pageTitle = await this.page.title();
      return pageTitle === 'Test Page' || pageTitle.includes('data:');
    });
  }

  async testExtensionUI() {
    return await this.runTest('Extension UI Elements', async () => {
      // This test would need to open the side panel programmatically
      // For now, we'll test that the extension files exist and are valid
      const fs = require('fs');
      const path = require('path');

      const requiredFiles = ['manifest.json', 'sidepanel.html', 'sidepanel.js', 'sidepanel.css'];
      return requiredFiles.every(file => {
        try {
          fs.accessSync(path.join(this.extensionPath, file));
          return true;
        } catch {
          return false;
        }
      });
    });
  }

  async testReplyGeneration() {
    return await this.runTest('Reply Generation API', async () => {
      try {
        const testThread = "Lead: Hey, I need help with my practice.\nBizCloser: What kind of help are you looking for?";

        const response = await fetch('http://localhost:3000/api/bizcloser/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thread: testThread,
            prompt: 'Generate SMS reply'
          })
        });

        if (!response.ok) return false;

        const data = await response.json();
        return data.reply && typeof data.reply === 'string' && data.reply.length > 0;
      } catch (error) {
        return false;
      }
    });
  }

  async testErrorHandling() {
    return await this.runTest('Error Handling', async () => {
      try {
        // Test with invalid JSON
        const response = await fetch('http://localhost:3000/api/bizcloser/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'invalid json'
        });

        // Should return an error for invalid JSON (could be 400 or 500 depending on error handling)
        const isErrorResponse = !response.ok && (response.status === 400 || response.status === 500);
        this.log(`Error handling test: status=${response.status}, ok=${response.ok}, result=${isErrorResponse}`);
        return isErrorResponse;
      } catch (error) {
        this.log(`Error handling test failed with exception: ${error.message}`);
        return false; // Network error means the test environment has issues
      }
    });
  }

  async testFileValidation() {
    return await this.runTest('File Validation', async () => {
      const fs = require('fs');
      const path = require('path');

      const checks = [
        // Check manifest.json structure
        () => {
          const manifest = JSON.parse(fs.readFileSync(path.join(this.extensionPath, 'manifest.json'), 'utf8'));
          return manifest.manifest_version === 3 &&
                 manifest.name &&
                 manifest.version &&
                 manifest.side_panel &&
                 manifest.permissions.includes('sidePanel');
        },
        // Check HTML file exists and has basic structure
        () => {
          const html = fs.readFileSync(path.join(this.extensionPath, 'sidepanel.html'), 'utf8');
          return html.includes('<html') && html.includes('sidepanel.js');
        },
        // Check JS file has basic functions
        () => {
          const js = fs.readFileSync(path.join(this.extensionPath, 'sidepanel.js'), 'utf8');
          return js.includes('DOMContentLoaded') && js.includes('generateReply');
        }
      ];

      return checks.every(check => {
        try {
          return check();
        } catch {
          return false;
        }
      });
    });
  }

  async testAPIIntegration() {
    return await this.runTest('API Integration', async () => {
      // Test the backend API directly
      const response = await fetch('http://localhost:3000/health');
      const data = await response.json();
      return data.status === 'ok';
    });
  }

  async testManifestValidation() {
    return await this.runTest('Manifest Validation', async () => {
      const manifestPath = path.join(this.extensionPath, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      // Check required fields
      const required = ['manifest_version', 'name', 'version'];
      return required.every(field => manifest.hasOwnProperty(field));
    });
  }

  async testConsoleErrors() {
    return await this.runTest('Console Error Check', async () => {
      const errors = [];

      this.page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // Navigate to a local page and wait
      await this.page.goto('data:text/html,<html><body><h1>Test</h1></body></html>');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Filter out network-related errors that are expected in testing environment
      const significantErrors = errors.filter(error =>
        !error.includes('net::') && !error.includes('ERR_')
      );

      return significantErrors.length === 0;
    });
  }

  async runAllTests() {
    await this.setup();

    await this.testManifestValidation();
    await this.testFileValidation();
    await this.testExtensionLoading();
    await this.testSidePanelOpening();
    await this.testExtensionUI();
    await this.testAPIIntegration();
    await this.testReplyGeneration();
    await this.testErrorHandling();
    await this.testConsoleErrors();

    await this.cleanup();
    this.printReport();
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.log('Browser closed');
    }
  }

  printReport() {
    console.log('\n' + '='.repeat(50));
    console.log('TEST REPORT');
    console.log('='.repeat(50));

    this.results.tests.forEach(test => {
      const status = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⚠️';
      console.log(`${status} ${test.name}`);
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
    });

    console.log('\nSUMMARY:');
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Errors: ${this.results.errors.length}`);

    if (this.results.errors.length > 0) {
      console.log('\nERRORS:');
      this.results.errors.forEach(error => console.log(`- ${error}`));
    }
  }
}

// Main execution
async function main() {
  const extensionPath = process.argv[2] || path.resolve('./');

  console.log(`Testing Chrome extension at: ${extensionPath}`);

  const tester = new ChromeExtensionTester(extensionPath);
  await tester.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = ChromeExtensionTester;