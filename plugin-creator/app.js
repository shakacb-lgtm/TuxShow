document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide Icons
  lucide.createIcons();

  // --- State Variables ---
  let apiKey = localStorage.getItem('tuxshow_gemini_api_key') || '';
  let activeModel = (localStorage.getItem('tuxshow_gemini_model') || 'gemini-2.0-flash').replace(/^models\//, '');
  
  let generatedFiles = {
    "manifest.json": "",
    "code": ""
  };
  let currentActiveTab = "manifest.json"; // "manifest.json" or "code"
  let isGenerating = false;
  let countdownInterval = null;
  let inRetryPhase = false;
  let retryCount = 0;

  // --- DOM Elements ---
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const apiKeyInput = document.getElementById('api-key-input');
  const modelSelect = document.getElementById('model-select');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const apiStatusBadge = document.getElementById('api-status-badge');

  const configForm = document.getElementById('config-form');
  const pluginIdInput = document.getElementById('plugin-id');
  const pluginNameInput = document.getElementById('plugin-name');
  const pluginVersionInput = document.getElementById('plugin-version');
  const pluginTypeSelect = document.getElementById('plugin-type');
  const pluginDescInput = document.getElementById('plugin-desc');
  const aiPromptTextarea = document.getElementById('ai-prompt');
  
  const generateBtn = document.getElementById('generate-btn');
  const generateBtnText = generateBtn.querySelector('.btn-text');
  const generateSpinner = generateBtn.querySelector('.spinner');
  
  const editorTabs = document.getElementById('editor-tabs');
  const codeEditor = document.getElementById('code-editor');
  const downloadBtn = document.getElementById('download-btn');
  const auditResults = document.getElementById('audit-results');

  // --- Setup Initial UI State ---
  updateApiStatus();
  apiKeyInput.value = apiKey;
  modelSelect.value = activeModel;

  // --- Event Listeners ---
  settingsBtn.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('tuxshow_gemini_api_key') || '';
    settingsModal.classList.remove('hidden');
  });

  closeModalBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', () => {
    apiKey = apiKeyInput.value.trim();
    activeModel = modelSelect.value.replace(/^models\//, '');
    localStorage.setItem('tuxshow_gemini_api_key', apiKey);
    localStorage.setItem('tuxshow_gemini_model', activeModel);
    updateApiStatus();
    settingsModal.classList.add('hidden');
  });

  pluginTypeSelect.addEventListener('change', () => {
    updateCodeTabLabel();
  });

  // Editor Tabs Switching
  editorTabs.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      const targetTab = e.target.getAttribute('data-file');
      if (targetTab === currentActiveTab) return;

      // Save currently active editor text
      generatedFiles[currentActiveTab] = codeEditor.value;

      // Switch active class
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');

      // Load new content
      currentActiveTab = targetTab;
      codeEditor.value = generatedFiles[currentActiveTab];
    }
  });

  // Track manual edits in editor
  codeEditor.addEventListener('input', () => {
    generatedFiles[currentActiveTab] = codeEditor.value;
    runSecurityAudit(false); // Re-run validation on edit
  });

  // Generation Trigger
  generateBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (isGenerating) return;
    
    if (!apiKey) {
      alert("Please configure your Gemini API Key in the settings panel first.");
      settingsModal.classList.remove('hidden');
      return;
    }

    if (!configForm.checkValidity()) {
      configForm.reportValidity();
      return;
    }

    await generatePlugin();
  });

  // Download Trigger
  downloadBtn.addEventListener('click', () => {
    packagePlugin();
  });

  // --- Helper Functions ---

  function updateApiStatus() {
    if (apiKey) {
      apiStatusBadge.className = 'status-badge status-configured';
      apiStatusBadge.querySelector('.status-label').textContent = 'API Connected';
    } else {
      apiStatusBadge.className = 'status-badge status-unconfigured';
      apiStatusBadge.querySelector('.status-label').textContent = 'API Key Missing';
    }
  }

  function updateCodeTabLabel() {
    const type = pluginTypeSelect.value;
    const codeTab = document.querySelector('.tab-btn[data-file="code"]');
    if (type === 'python-backend') {
      codeTab.textContent = 'main.py';
    } else if (type === 'ui-tab') {
      codeTab.textContent = 'ui.js';
    } else {
      codeTab.textContent = 'index.js';
    }
  }

  function getTargetCodeFilename() {
    const type = pluginTypeSelect.value;
    if (type === 'python-backend') return 'main.py';
    if (type === 'ui-tab') return 'ui.js';
    return 'index.js';
  }

  // --- AI Code Generation Pipeline ---

  async function generatePlugin(isRetry = false) {
    if (!isRetry) {
      retryCount = 0;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    inRetryPhase = false;
    
    isGenerating = true;
    generateBtn.disabled = true;
    generateSpinner.classList.remove('hidden');
    generateBtnText.textContent = 'Generating...';
    downloadBtn.classList.add('hidden');
    
    auditResults.innerHTML = `
      <div class="log-item log-warn">
        <i data-lucide="loader"></i>
        <span>Synthesizing system instructions and prompts...</span>
      </div>
    `;
    lucide.createIcons();

    const pluginId = pluginIdInput.value.trim();
    const pluginName = pluginNameInput.value.trim();
    const pluginVersion = pluginVersionInput.value.trim();
    const pluginType = pluginTypeSelect.value;
    const pluginDesc = pluginDescInput.value.trim();
    const prompt = aiPromptTextarea.value.trim();

    // Collect checked permissions
    const selectedPermissions = [];
    document.querySelectorAll('input[name="permissions"]:checked').forEach(cb => {
      selectedPermissions.push(cb.value);
    });

    const codeFilename = getTargetCodeFilename();

    // Construct the LLM Request System and User instructions
    const systemInstruction = `You are a core developer for TuxShow FOSS, a theatrical show control and projection mapping system.
Your task is to generate valid, safe plugins for TuxShow according to the user requirements.

You must return a single JSON object strictly matching this schema:
{
  "manifest": {
    "id": "string",
    "name": "string",
    "version": "string",
    "description": "string",
    "entry": "string (optional)",
    "entryPoints": {
      "ui": "string (optional)"
    },
    "permissions": ["string"]
  },
  "code": "string representing the full code file content"
}

### Guidelines:
1. "manifest" object rules:
   - Must contain keys: "id", "name", "version", "description", "permissions".
   - Under no circumstances list any permissions in the manifest that are not explicitly requested by the user: [${selectedPermissions.join(', ')}].
   - If the template is "node-backend", must have "entry": "index.js".
   - If the template is "python-backend", must have "entry": "main.py".
   - If the template is "ui-tab", must have "entryPoints": { "ui": "ui.js" }.

2. Code file ("${codeFilename}") rules:
   - If UI Tab ("ui.js"):
     - Must register the custom inspector tab with the global registry:
       \`window.tuxShowRegistry.registerInspectorTab({ id, name, icon, renderTab })\`
       where \`renderTab\` is a React component that displays custom widgets and settings. Make sure it uses React's API securely.
   - If Headless Backend ("index.js" or "main.py"):
     - MUST BE HEADLESS: References to browser DOM models like 'document', 'window', 'document.getElementById', or 'querySelector' are strictly prohibited.
     - FAIL-SAFE INTEGRITY: Wrap major lifecycle hooks (like initialization and teardown) in try/catch blocks.
     - NON-BLOCKING: Use async/await standard structures.
     - PUB/SUB INTERACTION: Interface with the host app using:
       - \`core.on(event_name, callback)\` to listen to events.
       - \`core.dispatch(event_name, payload)\` to emit changes.
       - \`core.cue.fire(index)\` to trigger cues.
       - \`core.layer.modify({ id, opacity, ... })\` to modify projection/compositor properties.

3. Make the generated plugin robust, clean, fully documented, and ready to compile/package. Do not include markdown code block syntax (like \`\`\`) inside the JSON properties. Return ONLY raw JSON matching the schema.`;

    const userPrompt = `Generate a ${pluginType} plugin named "${pluginName}" (ID: "${pluginId}", Version: "${pluginVersion}", Description: "${pluginDesc}").
Explicitly allowed permissions: [${selectedPermissions.join(', ')}].

Requirements:
${prompt}`;

    try {
      auditResults.innerHTML += `
        <div class="log-item log-warn">
          <i data-lucide="globe"></i>
          <span>Querying Gemini Model (${activeModel})...</span>
        </div>
      `;
      lucide.createIcons();

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemInstruction },
                { text: userPrompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                manifest: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "STRING" },
                    name: { type: "STRING" },
                    version: { type: "STRING" },
                    description: { type: "STRING" },
                    entry: { type: "STRING" },
                    entryPoints: {
                      type: "OBJECT",
                      properties: {
                        ui: { type: "STRING" }
                      }
                    },
                    permissions: {
                      type: "ARRAY",
                      items: { type: "STRING" }
                    }
                  },
                  required: ["id", "name", "version", "permissions"]
                },
                code: { type: "STRING" }
              },
              required: ["manifest", "code"]
            }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!textResponse) {
        throw new Error("Empty response returned from the model.");
      }

      // Parse LLM JSON Output
      const parsedResult = JSON.parse(textResponse.trim());
      
      if (!parsedResult.manifest || !parsedResult.code) {
        throw new Error("Invalid output format. Missing 'manifest' or 'code' fields.");
      }

      // Populate file buffers with proper stringification in case manifest is a JSON object
      generatedFiles["manifest.json"] = typeof parsedResult.manifest === 'string'
        ? parsedResult.manifest
        : JSON.stringify(parsedResult.manifest, null, 2);
      generatedFiles["code"] = typeof parsedResult.code === 'string'
        ? parsedResult.code
        : JSON.stringify(parsedResult.code, null, 2);

      // Sync active tab to text area
      codeEditor.value = generatedFiles[currentActiveTab];
      
      // Run the Gatekeeper Audit
      runSecurityAudit(true);

    } catch (err) {
      console.error('[Plugin Generator] API Call failed:', err);
      
      const retryMatch = err.message.match(/Please retry in ([\d\.]+)s/);
      if (retryMatch && retryCount < 2) {
        retryCount++;
        inRetryPhase = true;
        const retrySeconds = Math.ceil(parseFloat(retryMatch[1]));
        startRateLimitCountdown(retrySeconds);
      } else {
        inRetryPhase = false;
        auditResults.innerHTML = `
          <div class="log-item log-fail">
            <i data-lucide="alert-triangle"></i>
            <span>Generation Failed: ${err.message}</span>
          </div>
        `;
        if (retryCount >= 2) {
          auditResults.innerHTML += `
            <div class="log-item log-fail">
              <i data-lucide="alert-circle"></i>
              <span>Consecutive rate limit retries exhausted. Your API Key's free tier token quota is currently empty. Please wait 1-2 minutes for the quota pool to refresh, or check your daily limit logs in Google AI Studio.</span>
            </div>
          `;
        }
        lucide.createIcons();
      }
    } finally {
      if (!inRetryPhase) {
        isGenerating = false;
        generateBtn.disabled = false;
        generateSpinner.classList.add('hidden');
        generateBtnText.textContent = 'Generate Plugin Code';
      }
    }
  }

  function startRateLimitCountdown(seconds) {
    let remaining = seconds;
    
    const updateCountdown = () => {
      generateBtnText.textContent = `Retrying in ${remaining}s...`;
      auditResults.innerHTML = `
        <div class="log-item log-warn">
          <i data-lucide="clock"></i>
          <span>API Rate Limit hit. Auto-retrying in ${remaining} seconds...</span>
        </div>
      `;
      lucide.createIcons();
    };
    
    updateCountdown();
    
    countdownInterval = setInterval(async () => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        await generatePlugin(true);
      } else {
        updateCountdown();
      }
    }, 1000);
  }

  // --- The Gatekeeper Security Audit ---

  function runSecurityAudit(isNewGen = false) {
    const auditLogs = [];
    let hasHardFail = false;

    const manifestText = generatedFiles["manifest.json"];
    const codeText = generatedFiles["code"];
    const pluginType = pluginTypeSelect.value;
    const codeFilename = getTargetCodeFilename();

    // 1. Validate manifest.json Structure
    let parsedManifest = null;
    try {
      if (!manifestText.trim()) {
        throw new Error("Manifest is empty.");
      }
      parsedManifest = JSON.parse(manifestText);
      auditLogs.push({
        type: 'pass',
        message: 'Manifest parses successfully as valid JSON.'
      });

      // Check essential metadata keys
      const missingKeys = ['id', 'name', 'version', 'permissions'].filter(k => !(k in parsedManifest));
      if (missingKeys.length > 0) {
        throw new Error(`Manifest missing required keys: ${missingKeys.join(', ')}`);
      } else {
        auditLogs.push({
          type: 'pass',
          message: 'Manifest contains all required structural metadata keys.'
        });
      }
    } catch (e) {
      hasHardFail = true;
      auditLogs.push({
        type: 'fail',
        message: `Manifest parsing error: ${e.message}`
      });
    }

    // 2. Validate Permissions 1:1 Rule
    if (parsedManifest) {
      const selectedPermissions = [];
      document.querySelectorAll('input[name="permissions"]:checked').forEach(cb => {
        selectedPermissions.push(cb.value);
      });

      const manifestPerms = parsedManifest.permissions || [];
      const unrequested = manifestPerms.filter(p => !selectedPermissions.includes(p));
      const missing = selectedPermissions.filter(p => !manifestPerms.includes(p));

      if (unrequested.length > 0) {
        hasHardFail = true;
        auditLogs.push({
          type: 'fail',
          message: `Violation: Manifest contains unrequested permissions: [${unrequested.join(', ')}].`
        });
      } else if (missing.length > 0) {
        auditLogs.push({
          type: 'warn',
          message: `Warning: User requested [${missing.join(', ')}] but manifest did not include them.`
        });
      } else {
        auditLogs.push({
          type: 'pass',
          message: 'Permissions match selected UI configuration scopes 1:1.'
        });
      }
    }

    // 3. Sandboxing & DOM Access Checks for Headless Files
    if (pluginType !== 'ui-tab' && codeText) {
      const domKeywords = ['document', 'window', 'getElementById', 'querySelector', 'createElement'];
      const foundKeywords = [];
      
      domKeywords.forEach(keyword => {
        // Look for standalone words
        const regex = new RegExp(`\\b${keyword}\\b`);
        if (regex.test(codeText)) {
          foundKeywords.push(keyword);
        }
      });

      if (foundKeywords.length > 0) {
        hasHardFail = true;
        auditLogs.push({
          type: 'fail',
          message: `Violation: Headless backend references browser DOM structures: [${foundKeywords.join(', ')}].`
        });
      } else {
        auditLogs.push({
          type: 'pass',
          message: 'Sandbox Verified: Headless script contains zero browser DOM references.'
        });
      }
    }

    // 4. Validate Error Handlers & Lifecycle Wrappers
    if (pluginType !== 'ui-tab' && codeText) {
      const hasTryCatch = codeText.includes('try') && codeText.includes('catch');
      if (!hasTryCatch) {
        auditLogs.push({
          type: 'warn',
          message: 'Recommendation: Wrap core runner hooks and event listeners in try/catch to protect host stability.'
        });
      } else {
        auditLogs.push({
          type: 'pass',
          message: 'Lifecycle Integrity: Found exception wrappers (try/catch blocks).'
        });
      }
    }

    // 5. Validate UI Registration for Tab Plugins
    if (pluginType === 'ui-tab' && codeText) {
      const registersTab = codeText.includes('registerInspectorTab');
      if (!registersTab) {
        hasHardFail = true;
        auditLogs.push({
          type: 'fail',
          message: 'Violation: UI script missing registerInspectorTab tab registry registration.'
        });
      } else {
        auditLogs.push({
          type: 'pass',
          message: 'UI script registers tab correctly with global registry.'
        });
      }
    }

    // Render Audit logs to screen
    auditResults.innerHTML = '';
    auditLogs.forEach(log => {
      const icon = log.type === 'pass' ? 'check-circle' : (log.type === 'warn' ? 'alert-circle' : 'x-circle');
      const item = document.createElement('div');
      item.className = `log-item log-${log.type}`;
      item.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${log.message}</span>
      `;
      auditResults.appendChild(item);
    });
    lucide.createIcons();

    // Manage download state based on audit
    if (parsedManifest && !hasHardFail) {
      downloadBtn.disabled = false;
      downloadBtn.classList.remove('hidden');
      if (isNewGen) {
        const successLog = document.createElement('div');
        successLog.className = 'log-item log-pass';
        successLog.style.fontWeight = 'bold';
        successLog.innerHTML = `
          <i data-lucide="party-popper"></i>
          <span>Success! Security checklist completed. Ready to package.</span>
        `;
        auditResults.appendChild(successLog);
        lucide.createIcons();
      }
    } else {
      downloadBtn.disabled = true;
      downloadBtn.classList.add('hidden');
    }
  }

  // --- ZIP Packaging & Downloader ---

  function packagePlugin() {
    const pluginId = pluginIdInput.value.trim() || 'tuxshow-plugin';
    const codeFilename = getTargetCodeFilename();

    try {
      const zip = new JSZip();
      
      // Save editor updates in buffer
      generatedFiles[currentActiveTab] = codeEditor.value;

      zip.file("manifest.json", generatedFiles["manifest.json"]);
      zip.file(codeFilename, generatedFiles["code"]);

      zip.generateAsync({ type: "blob" }).then((content) => {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `${pluginId}.zip`;
        link.click();
        
        // Final Status
        const successLog = document.createElement('div');
        successLog.className = 'log-item log-pass';
        successLog.innerHTML = `
          <i data-lucide="check"></i>
          <span>Successfully downloaded ${pluginId}.zip! Ready for TuxShow import.</span>
        `;
        auditResults.appendChild(successLog);
        lucide.createIcons();
      });

    } catch (e) {
      alert(`Failed to construct ZIP package: ${e.message}`);
    }
  }
});
