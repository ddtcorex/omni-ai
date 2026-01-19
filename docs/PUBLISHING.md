# Publishing to the Chrome Web Store

Follow this guide to publish **Omni AI** to the official Chrome Web Store.

---

## 1. Prepare the Distribution Zip

First, you need to create a clean `.zip` file containing only the necessary files for the extension to run.

### Files to Include

- `manifest.json`
- `background/`
- `content/`
- `lib/`
- `assets/` (Icons, images)
- `popup/`
- `_locales/`
- `settings.html`, `settings.js`, `settings.css`

### Command to Create Zip

You can run this command in your terminal to generate the package:

```bash
zip -r omni-ai-v1.0.0.zip manifest.json background/ content/ lib/ assets/ popup/ _locales/ settings.html settings.js settings.css
```

---

## 2. Create a Developer Account

To publish on the Chrome Web Store, you need a Google Developer account.

1. Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
2. Sign in with your Google Account.
3. Pay the one-time **$5 USD** developer registration fee.
4. Complete your developer profile.

---

## 3. Upload the Extension

1. In the Developer Console, click **+ New Item**.
2. Upload the `omni-ai-v1.0.0.zip` file you created in Step 1.
3. The console will validate your `manifest.json`.

---

## 4. Fill Out Store Listing Details

You will need to provide the following "Product Identity" assets:

### Required Assets

- **Detailed Description**: Use the text from `README.md`.
- **Store Icon**: 128x128 pixels (use `assets/icons/logo.svg` converted to PNG).
- **Screenshots**: At least one 1280x800 or 640x400 image showing the extension in action.
- **Promo Tiles**: Optional but recommended for better visibility.

### Required Information

- **Category**: Productivity or Search Tools.
- **Language**: English (and any others you've localized).

---

## 5. Privacy & Permissions

This is the most critical part of the review process.

1. **Single Purpose**: State that Omni AI is a unified writing assistant and productivity tool.
2. **Permission Justification**:
    - `storage`: For saving user settings and API keys.
    - `activeTab`: To extract text from the page you are currently viewing.
    - `contextMenus`: To provide right-click AI actions.
    - `identity`: For Google Sign-in integration.
3. **Privacy Policy**: You must provide a URL to a privacy policy. You can host a simple one on GitHub Pages or a site like `privacypolicygenerator.info`.
4. **Remote Code**: Manifest V3 does **not** allow remote code. Ensure all your logic is local (which it is).

---

## 6. Submit for Review

1. Once all sections are green, click **Submit for Review**.
2. Review usually takes **1–3 business days**, but can take up to a week for the first version.
3. You will receive an email once it is published!

---

## 🚀 Pro Tips for Approval

- **Screenshot Quality**: Use high-quality screenshots. Show the ✨ floating button and the Usage Dashboard.
- **Clear Description**: Clearly explain that users need an API key (Gemini/Groq) to use the extension.
- **Permission Scope**: Chrome reviewers prefer the narrowest permissions possible. Our current list is well-scoped for the features provided.
